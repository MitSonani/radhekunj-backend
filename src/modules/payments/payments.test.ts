/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { env } from '../../config/env.js';
import * as paymentService from './service.js';
import { appConfig } from '../../config/index.js';

const app = createApp();

function generateCustomerToken(user: { id: string; role: string; mobileNumber: string }): string {
  return jwt.sign(
    { id: user.id, role: user.role, mobileNumber: user.mobileNumber },
    appConfig.jwtSecret,
    { expiresIn: '1h' },
  );
}

describe('Payments Module & Lifecycle', () => {
  let customerId: string;
  let customerToken: string;
  let _otherCustomerId: string;
  let otherCustomerToken: string;
  let addressId: string;
  let variantId: string;

  beforeEach(async () => {
    // Clean database
    await prisma.payment.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.couponUsage.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.productImage.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.productVariantAttribute.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.address.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});

    // 1. Roles & Customers
    const customerRole = await prisma.role.create({ data: { name: 'customer' } });

    const user = await prisma.user.create({
      data: {
        mobileNumber: '9876543210',
        name: 'Test Customer',
        roleId: customerRole.id,
      },
    });
    customerId = user.id;
    customerToken = generateCustomerToken({
      id: user.id,
      role: 'customer',
      mobileNumber: user.mobileNumber,
    });

    const otherUser = await prisma.user.create({
      data: {
        mobileNumber: '9123456780',
        name: 'Other Customer',
        roleId: customerRole.id,
      },
    });
    _otherCustomerId = otherUser.id;
    otherCustomerToken = generateCustomerToken({
      id: otherUser.id,
      role: 'customer',
      mobileNumber: otherUser.mobileNumber,
    });

    // 2. Address
    const addr = await prisma.address.create({
      data: {
        userId: customerId,
        fullName: 'Test Customer',
        countryCode: '+91',
        mobileNumber: '9876543210',
        addressLine1: '123 Fashion Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'India',
        isDefault: true,
      },
    });
    addressId = addr.id;

    // 3. Catalog & Inventory
    const category = await prisma.category.create({
      data: { name: 'Apparel', slug: 'apparel', status: 'ACTIVE' },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Silk Kurta',
        slug: 'silk-kurta',
        categoryId: category.id,
        basePrice: 999.00,
        status: 'ACTIVE',
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'KURTA-SILK-01',
        price: 2500,
        status: 'ACTIVE',
      },
    });
    variantId = variant.id;

    await prisma.inventory.create({
      data: {
        variantId: variant.id,
        quantity: 20,
        reservedQuantity: 0,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // 1. COD Order Placement
  it('should place a COD order with PaymentStatus = PENDING and OrderStatus = CONFIRMED', async () => {
    // Add item to cart
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 });

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'COD' })
      .expect(HTTP_STATUS.CREATED);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.paymentMethod).toBe('COD');
    expect(res.body.data.paymentStatus).toBe('PENDING');
    expect(res.body.data.totalAmount).toBe('5000.00');

    // Verify Payment table
    const payments = await prisma.payment.findMany({ where: { orderId: res.body.data.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.paymentMethod).toBe('COD');
    expect(payments[0]?.paymentStatus).toBe('PENDING');
    expect(payments[0]?.amount.toString()).toBe('5000');
  });

  // 2. Razorpay Order Placement
  it('should place a Razorpay order with OrderStatus = PENDING_PAYMENT and return Razorpay payload', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'RAZORPAY' })
      .expect(HTTP_STATUS.CREATED);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING_PAYMENT');
    expect(res.body.data.paymentMethod).toBe('RAZORPAY');
    expect(res.body.data.paymentStatus).toBe('PENDING');
    expect(res.body.data.razorpay).toBeDefined();
    expect(res.body.data.razorpay.amount).toBe(250000); // 2500 * 100 paise
    expect(res.body.data.razorpay.razorpayOrderId).toMatch(/^order_/);
  });

  // 3. Razorpay Signature Verification
  it('should verify valid Razorpay payment signature and mark Payment = PAID & Order = CONFIRMED', async () => {
    // 1. Create order with RAZORPAY
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'RAZORPAY' })
      .expect(HTTP_STATUS.CREATED);

    const orderId = orderRes.body.data.id;
    const razorpayOrderId = orderRes.body.data.razorpay.razorpayOrderId;
    const razorpayPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;

    // 2. Generate valid HMAC signature
    const secret = env.RAZORPAY_KEY_SECRET || 'rzp_test_mock_secret';
    const razorpaySignature = crypto
      .createHmac('sha256', secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    // 3. Verify Payment
    const verifyRes = await request(app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      })
      .expect(HTTP_STATUS.OK);

    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.paymentStatus).toBe('PAID');
    expect(verifyRes.body.data.providerPaymentId).toBe(razorpayPaymentId);
    expect(verifyRes.body.data.paidAt).toBeDefined();

    // Verify Order status updated to CONFIRMED
    const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(updatedOrder?.status).toBe('CONFIRMED');
  });

  // 4. Invalid Signature Rejection
  it('should reject invalid Razorpay payment signature with 400 and record failure', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'RAZORPAY' });

    const orderId = orderRes.body.data.id;
    const razorpayOrderId = orderRes.body.data.razorpay.razorpayOrderId;

    const res = await request(app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId,
        razorpayOrderId,
        razorpayPaymentId: 'pay_tampered_123',
        razorpaySignature: 'invalid_tampered_signature',
      })
      .expect(HTTP_STATUS.BAD_REQUEST);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid payment signature/i);

    // Verify failed payment logged
    const failedPayment = await prisma.payment.findFirst({
      where: { orderId, paymentStatus: 'FAILED' },
    });
    expect(failedPayment).toBeDefined();
  });

  // 5. Verification Idempotency
  it('should return existing paid payment on repeated duplicate verification without extra mutations', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'RAZORPAY' });

    const orderId = orderRes.body.data.id;
    const razorpayOrderId = orderRes.body.data.razorpay.razorpayOrderId;
    const razorpayPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;

    const secret = env.RAZORPAY_KEY_SECRET || 'rzp_test_mock_secret';
    const razorpaySignature = crypto
      .createHmac('sha256', secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    // First verification
    const res1 = await request(app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature })
      .expect(HTTP_STATUS.OK);

    // Second verification with identical payload
    const res2 = await request(app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature })
      .expect(HTTP_STATUS.OK);

    expect(res1.body.data.id).toBe(res2.body.data.id);
    expect(res1.body.data.providerPaymentId).toBe(res2.body.data.providerPaymentId);

    // Ensure only 1 payment row exists for this order
    const count = await prisma.payment.count({ where: { orderId } });
    expect(count).toBe(1);
  });

  // 6. Webhook Processing
  it('should process a valid payment.captured webhook event', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'RAZORPAY' });

    const orderId = orderRes.body.data.id;
    const razorpayOrderId = orderRes.body.data.razorpay.razorpayOrderId;
    const providerPaymentId = `pay_webhook_${Date.now()}`;

    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            order_id: razorpayOrderId,
            amount: 250000,
            status: 'captured',
            notes: { orderId },
          },
        },
      },
    });

    const secret = env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_KEY_SECRET || 'rzp_test_mock_secret';
    const signature = crypto.createHmac('sha256', secret).update(webhookBody).digest('hex');

    const webhookRes = await request(app)
      .post('/api/v1/payments/razorpay/webhook')
      .set('x-razorpay-signature', signature)
      .set('Content-Type', 'application/json')
      .send(webhookBody)
      .expect(HTTP_STATUS.OK);

    expect(webhookRes.body.success).toBe(true);
    expect(webhookRes.body.received).toBe(true);

    // Verify order was transitioned to CONFIRMED
    const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(updatedOrder?.status).toBe('CONFIRMED');
  });

  // 7. Payment History Retrieval & Security
  it('should return payments for an order and reject unauthorized customer access', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, paymentMethod: 'COD' });

    const orderId = orderRes.body.data.id;

    // Authorized access
    const res = await request(app)
      .get(`/api/v1/payments/order/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(HTTP_STATUS.OK);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].paymentMethod).toBe('COD');

    // Unauthorized access by another user
    await request(app)
      .get(`/api/v1/payments/order/${orderId}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(HTTP_STATUS.NOT_FOUND);
  });
});

describe('Production Payment Safety Guards', () => {
  it('rejects initiating Razorpay payment in production when credentials are mock or missing', async () => {
    const origProd = appConfig.isProduction;
    try {
      appConfig.isProduction = true;
      await expect(
        paymentService.createRazorpayOrder('dummy-user-id', 'dummy-order-id')
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Razorpay payment gateway is not configured for production',
      });
    } finally {
      appConfig.isProduction = origProd;
    }
  });

  it('rejects verifying Razorpay payment in production when secret is mock or missing', async () => {
    const origProd = appConfig.isProduction;
    try {
      appConfig.isProduction = true;
      await expect(
        paymentService.verifyRazorpayPayment('dummy-user-id', {
          orderId: 'dummy-order-id',
          razorpayOrderId: 'order_mock_123',
          razorpayPaymentId: 'pay_mock_123',
          razorpaySignature: 'sig_mock_123',
        })
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Razorpay payment gateway is not configured for production',
      });
    } finally {
      appConfig.isProduction = origProd;
    }
  });

  it('rejects processing Razorpay webhook in production when webhook secret is missing', async () => {
    const origProd = appConfig.isProduction;
    const origWebhook = appConfig.razorpay.webhookSecret;
    const origKeySec = appConfig.razorpay.keySecret;
    try {
      appConfig.isProduction = true;
      appConfig.razorpay.webhookSecret = undefined;
      appConfig.razorpay.keySecret = undefined;
      await expect(
        paymentService.handleRazorpayWebhook('{}', 'dummy-sig')
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Razorpay webhook secret is not configured for production',
      });
    } finally {
      appConfig.isProduction = origProd;
      appConfig.razorpay.webhookSecret = origWebhook;
      appConfig.razorpay.keySecret = origKeySec;
    }
  });
});
