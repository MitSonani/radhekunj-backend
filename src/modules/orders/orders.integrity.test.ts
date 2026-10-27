/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { appConfig } from '../../config/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { OrderStatus, PaymentStatus, RefundStatus } from '@prisma/client';
import { expireOrderIfPending } from './expiryQueue.js';

const app = createApp();

describe('Phase 12B — Critical Ecommerce Integrity & Lifecycle Suite', () => {
  let adminToken: string;
  let customerId: string;
  let customerToken: string;
  let variantId: string;
  let addressId: string;

  beforeEach(async () => {
    // 1. Clean Database
    await prisma.refund.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.couponUsage.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.couponProduct.deleteMany({});
    await prisma.couponCategory.deleteMany({});
    await prisma.coupon.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.productVariantAttribute.deleteMany({});
    await prisma.productImage.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.address.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.storeSetting.deleteMany({});

    // 2. Setup Roles and Users
    const adminRole = await prisma.role.create({ data: { name: 'admin' } });
    const customerRole = await prisma.role.create({ data: { name: 'customer' } });

    const adminUser = await prisma.user.create({
      data: {
        name: 'Admin User',
        mobileNumber: '+919999900000',
        countryCode: '+91',
        roleId: adminRole.id,
      },
    });
    adminToken = jwt.sign(
      { id: adminUser.id, role: 'admin', mobileNumber: adminUser.mobileNumber },
      appConfig.jwtSecret,
    );

    const customerUser = await prisma.user.create({
      data: {
        name: 'Test Customer',
        mobileNumber: '+919999911111',
        countryCode: '+91',
        roleId: customerRole.id,
      },
    });
    customerId = customerUser.id;
    customerToken = jwt.sign(
      { id: customerUser.id, role: 'customer', mobileNumber: customerUser.mobileNumber },
      appConfig.jwtSecret,
    );

    // 3. Setup Catalog & Inventory (10 units initially)
    const category = await prisma.category.create({
      data: { name: 'Suits', slug: 'suits', status: 'ACTIVE' },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Silk Kurta Set',
        slug: 'silk-kurta-set',
        basePrice: 1500,
        categoryId: category.id,
        status: 'ACTIVE',
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'SILK-KRT-M',
        price: 1500,
        status: 'ACTIVE',
      },
    });
    variantId = variant.id;

    await prisma.inventory.create({
      data: {
        variantId: variant.id,
        quantity: 10,
        reservedQuantity: 0,
      },
    });

    // 4. Setup Address (Intrastate - Gujarat)
    const address = await prisma.address.create({
      data: {
        userId: customerId,
        fullName: 'Test Customer',
        countryCode: '+91',
        mobileNumber: '9999911111',
        addressLine1: '123 Ring Road',
        city: 'Surat',
        state: 'Gujarat',
        postalCode: '395001',
        country: 'India',
      },
    });
    addressId = address.id;

    // 5. Setup Coupon (Flat 200 off)
    await prisma.coupon.create({
      data: {
        code: 'SAVE200',
        discountType: 'FIXED_AMOUNT',
        discountValue: 200,
        scope: 'CART',
        minimumCartValue: 500,
        status: 'ACTIVE',
        startsAt: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  });

  it('1. Razorpay checkout atomically reserves inventory for 15 minutes without reducing physical stock', async () => {
    // Add 2 items to cart
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 })
      .expect(HTTP_STATUS.OK);

    // Place order via Razorpay
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddressId: addressId,
        paymentMethod: 'RAZORPAY',
      })
      .expect(HTTP_STATUS.CREATED);

    const order = res.body.data;
    expect(order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(order.expiresAt).not.toBeNull();
    const expiryTime = new Date(order.expiresAt).getTime();
    expect(expiryTime).toBeGreaterThan(Date.now() + 14 * 60 * 1000); // ~15 min
    expect(order.razorpay).toBeDefined();

    // Verify inventory state: quantity remains 10, reservedQuantity becomes 2
    const inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(10);
    expect(inv?.reservedQuantity).toBe(2);
  });

  it('2. Payment verification commits reservation exactly once (quantity decremented, reserved cleared)', async () => {
    // Add 2 items and place order
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 })
      .expect(HTTP_STATUS.OK);

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddressId: addressId,
        paymentMethod: 'RAZORPAY',
      })
      .expect(HTTP_STATUS.CREATED);

    const order = orderRes.body.data;
    const razorpayOrderId = order.razorpay.razorpayOrderId;
    const razorpayPaymentId = 'pay_test_' + Date.now();

    const keySecret = appConfig.razorpay.keySecret || 'rzp_test_mock_secret';
    const signature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    // Verify payment
    const verifyRes = await request(app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: order.id,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: signature,
      })
      .expect(HTTP_STATUS.OK);

    expect(verifyRes.body.data.paymentStatus).toBe(PaymentStatus.PAID);

    // Verify order is CONFIRMED and expiresAt is null
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe(OrderStatus.CONFIRMED);
    expect(updatedOrder?.expiresAt).toBeNull();

    // Inventory: physical quantity decremented from 10 to 8, reserved cleared to 0
    const inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(8);
    expect(inv?.reservedQuantity).toBe(0);

    // Idempotency: Duplicate verify call does NOT commit stock a second time
    await request(app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: order.id,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: signature,
      })
      .expect(HTTP_STATUS.OK);

    const invAfterDuplicate = await prisma.inventory.findUnique({ where: { variantId } });
    expect(invAfterDuplicate?.quantity).toBe(8);
    expect(invAfterDuplicate?.reservedQuantity).toBe(0);
  });

  it('3. Order expiry worker releases reserved stock and rolls back coupon usage', async () => {
    // Apply coupon to cart
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 })
      .expect(HTTP_STATUS.OK);

    await request(app)
      .post('/api/v1/cart/coupon')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ code: 'SAVE200' })
      .expect(HTTP_STATUS.OK);

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddressId: addressId,
        paymentMethod: 'RAZORPAY',
      })
      .expect(HTTP_STATUS.CREATED);

    const orderId = orderRes.body.data.id;

    // Verify coupon usage was recorded
    const couponUsageBefore = await prisma.couponUsage.findFirst({ where: { orderId } });
    expect(couponUsageBefore).not.toBeNull();

    // Trigger expiration
    const expiryResult = await expireOrderIfPending(orderId);
    expect(expiryResult.expired).toBe(true);

    // Order state: CANCELLED, expiresAt: null
    const expiredOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(expiredOrder?.status).toBe(OrderStatus.CANCELLED);
    expect(expiredOrder?.expiresAt).toBeNull();

    // Stock state: reservedQuantity returned from 2 to 0, quantity remains 10
    const inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(10);
    expect(inv?.reservedQuantity).toBe(0);

    // Coupon usage rolled back
    const couponUsageAfter = await prisma.couponUsage.findFirst({ where: { orderId } });
    expect(couponUsageAfter).toBeNull();
  });

  it('4. COD orders immediately decrement physical stock and are immune to expiration workflow', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 3 })
      .expect(HTTP_STATUS.OK);

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddressId: addressId,
        paymentMethod: 'COD',
      })
      .expect(HTTP_STATUS.CREATED);

    const order = orderRes.body.data;
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.expiresAt).toBeNull();

    // Physical stock decremented from 10 to 7, reserved is 0
    const inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(7);
    expect(inv?.reservedQuantity).toBe(0);

    // Attempting to expire COD order is defensively rejected
    const expiryResult = await expireOrderIfPending(order.id);
    expect(expiryResult.expired).toBe(false);
    expect(expiryResult.reason).toContain('ALREADY_CONFIRMED');

    // Stock untouched
    const invAfter = await prisma.inventory.findUnique({ where: { variantId } });
    expect(invAfter?.quantity).toBe(7);
  });

  it('5. Cancellation transitions correctly restore committed stock or release reserved stock', async () => {
    // Case A: Cancel CONFIRMED COD order -> Restores committed stock
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 })
      .expect(HTTP_STATUS.OK);

    const codRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'COD' })
      .expect(HTTP_STATUS.CREATED);

    const codOrderId = codRes.body.data.id;
    let inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(8);

    // Admin cancels CONFIRMED order
    await request(app)
      .patch(`/api/v1/admin/orders/${codOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CANCELLED' })
      .expect(HTTP_STATUS.OK);

    // Committed stock restored back to 10
    inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(10);
    expect(inv?.reservedQuantity).toBe(0);

    // Case B: Cancel PENDING_PAYMENT Razorpay order -> Releases reserved stock
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 4 })
      .expect(HTTP_STATUS.OK);

    const rzpRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'RAZORPAY' })
      .expect(HTTP_STATUS.CREATED);

    const rzpOrderId = rzpRes.body.data.id;
    inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(10);
    expect(inv?.reservedQuantity).toBe(4);

    // Admin cancels PENDING_PAYMENT order
    await request(app)
      .patch(`/api/v1/admin/orders/${rzpOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CANCELLED' })
      .expect(HTTP_STATUS.OK);

    // Reserved stock released, quantity intact
    inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(10);
    expect(inv?.reservedQuantity).toBe(0);
  });

  it('6. Payment arriving after order expiry automatically initiates gateway refund and does not commit stock', async () => {
    // 1. Place Razorpay order
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 })
      .expect(HTTP_STATUS.OK);

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'RAZORPAY' })
      .expect(HTTP_STATUS.CREATED);

    const order = orderRes.body.data;
    const rzpOrderId = order.razorpay.razorpayOrderId;
    const rzpPaymentId = 'pay_race_' + Date.now();

    // 2. 15-minute expiration occurs first
    await expireOrderIfPending(order.id);
    const expiredOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(expiredOrder?.status).toBe(OrderStatus.CANCELLED);

    // Stock was released back to 10
    let inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(10);
    expect(inv?.reservedQuantity).toBe(0);

    // 3. Late payment verification arrives
    const keySecret = appConfig.razorpay.keySecret || 'rzp_test_mock_secret';
    const signature = crypto
      .createHmac('sha256', keySecret)
      .update(`${rzpOrderId}|${rzpPaymentId}`)
      .digest('hex');

    const lateVerifyRes = await request(app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: order.id,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: signature,
      })
      .expect(HTTP_STATUS.BAD_REQUEST);

    expect(lateVerifyRes.body.message).toContain('automatic refund has been initiated');

    // 4. Verify refund entity was created and processed
    const refund = await prisma.refund.findFirst({
      where: { orderId: order.id },
    });
    expect(refund).not.toBeNull();
    expect(refund?.status).toBe(RefundStatus.PROCESSED);
    expect(refund?.gatewayRefundId).toMatch(/^rfnd_/);

    // 5. Stock was NOT committed (no double deduction or overselling)
    inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(10);
    expect(inv?.reservedQuantity).toBe(0);
  });

  it('7. Webhook payment.captured for expired order creates and processes refund safely', async () => {
    // Place order
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 })
      .expect(HTTP_STATUS.OK);

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'RAZORPAY' })
      .expect(HTTP_STATUS.CREATED);

    const order = orderRes.body.data;
    const providerOrderId = order.razorpay.razorpayOrderId;
    const providerPaymentId = 'pay_wh_race_' + Date.now();

    // Expire order
    await expireOrderIfPending(order.id);

    // Webhook arrives
    const webhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            order_id: providerOrderId,
            amount: 300000,
            status: 'captured',
          },
        },
      },
    });

    const webhookSecret = appConfig.razorpay.webhookSecret || appConfig.razorpay.keySecret || 'rzp_test_mock_secret';
    const signature = crypto.createHmac('sha256', webhookSecret).update(webhookPayload).digest('hex');

    await request(app)
      .post('/api/v1/payments/razorpay/webhook')
      .set('x-razorpay-signature', signature)
      .set('Content-Type', 'application/json')
      .send(webhookPayload)
      .expect(HTTP_STATUS.OK);

    // Refund created & processed
    const refund = await prisma.refund.findFirst({ where: { orderId: order.id } });
    expect(refund).not.toBeNull();
    expect(refund?.status).toBe(RefundStatus.PROCESSED);

    // Stock stays at 10
    const inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(10);
    expect(inv?.reservedQuantity).toBe(0);
  });

  it('8. Financial amounts, tax breakdown, and shipping details are accurately calculated and stored in order snapshot', async () => {
    // Configure store setting for tax: 18% GST (Gujarat)
    await prisma.storeSetting.create({
      data: {
        key: 'tax',
        value: {
          enabled: true,
          ratePercentage: 18,
          storeState: 'Gujarat',
          isInclusive: false,
        },
      },
    });

    // Configure store setting for shipping: 100 flat fee, free threshold 5000
    await prisma.storeSetting.create({
      data: {
        key: 'shipping',
        value: {
          enabled: true,
          flatRate: 100,
          freeShippingThreshold: 5000,
        },
      },
    });

    // 1 item = 1500 subtotal
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 })
      .expect(HTTP_STATUS.OK);

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'COD' })
      .expect(HTTP_STATUS.CREATED);

    const order = orderRes.body.data;
    // Subtotal: 1500
    // Shipping: 100 (since 1500 < 5000)
    // Intrastate GST (18% of 1500 = 270: 135 CGST + 135 SGST)
    // Total: 1500 + 100 + 270 = 1870
    expect(order.subtotal).toBe('1500.00');
    expect(order.shippingFee).toBe('100.00');
    expect(order.taxAmount).toBe('270.00');
    expect(order.totalAmount).toBe('1870.00');

    expect(order.taxBreakdown).toBeDefined();
    expect(order.taxBreakdown.isInterstate).toBe(false);
    expect(order.taxBreakdown.cgstRate).toBe(9);
    expect(order.taxBreakdown.cgstAmount).toBe('135.00');
    expect(order.taxBreakdown.sgstRate).toBe(9);
    expect(order.taxBreakdown.sgstAmount).toBe('135.00');
    expect(order.taxBreakdown.igstAmount).toBe('0.00');

    expect(order.shippingDetails).toBeDefined();
    expect(order.shippingDetails.isFree).toBe(false);
    expect(order.shippingDetails.rate).toBe('100.00');
  });
});
