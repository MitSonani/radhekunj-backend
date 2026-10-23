/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { appConfig } from '../../config/index.js';

const app = createApp();

let customerId: string;
let otherCustomerId: string;
let customerToken: string;
let otherCustomerToken: string;
let categoryId: string;
let _attributeId: string;
let attributeValueId: string;
let productId: string;
let variantId: string;
let addressId: string;
let otherUserAddressId: string;

async function cleanDatabase() {
  await prisma.orderItem.deleteMany({});
  await prisma.couponUsage.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.couponProduct.deleteMany({});
  await prisma.couponCategory.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.cartItem.deleteMany({});
  await prisma.cart.deleteMany({});
  await prisma.wishlistItem.deleteMany({});
  await prisma.address.deleteMany({});
  await prisma.inventory.deleteMany({});
  await prisma.productVariantAttribute.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.productVariant.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.attributeValue.deleteMany({});
  await prisma.attribute.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
}

async function seedCatalogAndUsers() {
  const customerRole = await prisma.role.create({ data: { name: 'customer' } });

  const user1 = await prisma.user.create({
    data: {
      name: 'Test Customer',
      mobileNumber: '+919999911111',
      countryCode: '+91',
      roleId: customerRole.id,
    },
  });
  customerId = user1.id;
  customerToken = jwt.sign(
    { id: user1.id, role: 'customer', mobileNumber: user1.mobileNumber },
    appConfig.jwtSecret,
  );

  const user2 = await prisma.user.create({
    data: {
      name: 'Other Customer',
      mobileNumber: '+919999922222',
      countryCode: '+91',
      roleId: customerRole.id,
    },
  });
  otherCustomerId = user2.id;
  otherCustomerToken = jwt.sign(
    { id: user2.id, role: 'customer', mobileNumber: user2.mobileNumber },
    appConfig.jwtSecret,
  );

  const addr1 = await prisma.address.create({
    data: {
      userId: customerId,
      fullName: 'Test Customer',
      countryCode: '+91',
      mobileNumber: '9999911111',
      addressLine1: '123 Fashion Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
      country: 'India',
      isDefault: true,
    },
  });
  addressId = addr1.id;

  const addr2 = await prisma.address.create({
    data: {
      userId: otherCustomerId,
      fullName: 'Other Customer',
      countryCode: '+91',
      mobileNumber: '9999922222',
      addressLine1: '456 Silk Lane',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110001',
      country: 'India',
      isDefault: true,
    },
  });
  otherUserAddressId = addr2.id;

  const category = await prisma.category.create({
    data: { name: 'Sarees', slug: 'sarees', status: 'ACTIVE' },
  });
  categoryId = category.id;

  const attribute = await prisma.attribute.create({
    data: { name: 'Size', slug: 'size' },
  });
  _attributeId = attribute.id;

  const attributeValue = await prisma.attributeValue.create({
    data: { attributeId: attribute.id, value: 'Free Size', slug: 'free-size' },
  });
  attributeValueId = attributeValue.id;

  const product = await prisma.product.create({
    data: {
      categoryId,
      name: 'Banarasi Silk Saree',
      slug: 'banarasi-silk-saree',
      basePrice: 5000,
      status: 'ACTIVE',
    },
  });
  productId = product.id;

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: 'BSS-FS-01',
      price: 5000,
      status: 'ACTIVE',
      inventory: {
        create: {
          quantity: 10,
          reservedQuantity: 0,
        },
      },
      attributes: {
        create: {
          attributeValueId,
        },
      },
    },
  });
  variantId = variant.id;
}

describe('Order Module API & Atomic Placement', () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedCatalogAndUsers();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // 1. Basic Order Placement
  it('should place an order atomically from an active cart and clear the cart', async () => {
    // Add item to cart
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 })
      .expect(HTTP_STATUS.OK);

    // Place order
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId })
      ;
    if (res.status !== 201) console.log("CHECKOUT FAILED:", res.status, res.body);
    expect(res.status).toBe(HTTP_STATUS.CREATED);

    expect(res.body.success).toBe(true);
    expect(res.body.data.orderNumber).toMatch(/^ORD-/);
    expect(res.body.data.subtotal).toBe('10000.00');
    expect(res.body.data.totalAmount).toBe('10000.00');
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].sku).toBe('BSS-FS-01');
    expect(res.body.data.items[0].productName).toBe('Banarasi Silk Saree');
    expect(res.body.data.items[0].unitPrice).toBe('5000.00');
    expect(res.body.data.items[0].quantity).toBe(2);
    expect(res.body.data.items[0].lineTotal).toBe('10000.00');
    expect(res.body.data.shippingAddress.addressLine1).toBe('123 Fashion Street');

    // Verify inventory decremented
    const inventory = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inventory?.quantity).toBe(8);

    // Verify cart was cleared
    const cartRes = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(HTTP_STATUS.OK);
    expect(cartRes.body.data.items).toHaveLength(0);
    expect(cartRes.body.data.totalQuantity).toBe(0);
  });

  // 2. Empty Cart Rejection
  it('should reject order placement when the cart is empty', async () => {
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId })
      .expect(HTTP_STATUS.UNPROCESSABLE);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/empty/i);
  });

  // 3. Invalid Address Rejection
  it('should reject order placement with a non-existent address ID', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const nonExistentUuid = 'a0000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: nonExistentUuid })
      .expect(HTTP_STATUS.UNPROCESSABLE);

    expect(res.body.success).toBe(false);
  });

  // 4. Other User's Address Rejection
  it('should reject order placement with an address belonging to another user', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: otherUserAddressId })
      .expect(HTTP_STATUS.UNPROCESSABLE);

    expect(res.body.success).toBe(false);
  });

  // 5. Insufficient Inventory Rejection
  it('should reject order placement when requested quantity exceeds available stock', async () => {
    // Add 5 to cart
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 5 });

    // Externally reduce stock to 3
    await prisma.inventory.update({
      where: { variantId },
      data: { quantity: 3 },
    });

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId })
      .expect(HTTP_STATUS.UNPROCESSABLE);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/insufficient stock/i);

    // Verify cart remains intact after failed checkout
    const cartRes = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(HTTP_STATUS.OK);
    expect(cartRes.body.data.items).toHaveLength(1);
  });

  // 6. Coupon Application & Consumption
  it('should apply coupon discount and create CouponUsage on successful order placement', async () => {
    // Create coupon
    const coupon = await prisma.coupon.create({
      data: {
        code: 'SAVE10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        scope: 'CART',
        status: 'ACTIVE',
        startsAt: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() + 86400000),
        usageLimit: 5,
        perUserLimit: 1,
      },
    });

    // Add item to cart and apply coupon
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 });

    await request(app)
      .post('/api/v1/cart/coupon')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ code: 'SAVE10' })
      .expect(HTTP_STATUS.OK);

    // Place order
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId })
      .expect(HTTP_STATUS.CREATED);

    expect(res.body.data.subtotal).toBe('10000.00');
    expect(res.body.data.discountAmount).toBe('1000.00');
    expect(res.body.data.totalAmount).toBe('9000.00');

    // Verify CouponUsage was recorded with orderId
    const usage = await prisma.couponUsage.findFirst({
      where: { couponId: coupon.id, userId: customerId },
    });
    expect(usage).toBeDefined();
    expect(usage?.orderId).toBe(res.body.data.id);
    expect(usage?.discountAmount.toString()).toBe('1000');
  });

  // 7. Historical Snapshot Preservation
  it('should preserve historical snapshots even if product price or user address changes later', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId })
      .expect(HTTP_STATUS.CREATED);

    const orderId = orderRes.body.data.id;

    // Mutate catalog product name and variant price
    await prisma.product.update({
      where: { id: productId },
      data: { name: 'Completely Changed Name' },
    });
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { price: 99999 },
    });

    // Mutate user address
    await prisma.address.update({
      where: { id: addressId },
      data: { addressLine1: '999 New Address St' },
    });

    // Fetch order details
    const res = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(HTTP_STATUS.OK);

    // Verify historical snapshot values remained unchanged
    expect(res.body.data.items[0].productName).toBe('Banarasi Silk Saree');
    expect(res.body.data.items[0].unitPrice).toBe('5000.00');
    expect(res.body.data.subtotal).toBe('5000.00');
    expect(res.body.data.shippingAddress.addressLine1).toBe('123 Fashion Street');
  });

  // 8. Idempotency Key & Duplicate Prevention
  it('should replay the existing order when same idempotencyKey is submitted again', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const idempotencyKey = 'idem-test-12345';

    // First request
    const res1 = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, idempotencyKey })
      .expect(HTTP_STATUS.CREATED);

    // Second request with same idempotencyKey
    const res2 = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId, idempotencyKey })
      .expect(HTTP_STATUS.CREATED);

    expect(res1.body.data.id).toBe(res2.body.data.id);
    expect(res1.body.data.orderNumber).toBe(res2.body.data.orderNumber);

    // Confirm only 1 order exists in database
    const ordersCount = await prisma.order.count({ where: { userId: customerId } });
    expect(ordersCount).toBe(1);
  });

  // 9. Order Authorization Check
  it('should not allow User B to view User A’s order', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId })
      .expect(HTTP_STATUS.CREATED);

    const orderId = orderRes.body.data.id;

    // User B attempts to access User A's order
    await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(HTTP_STATUS.NOT_FOUND);
  });

  // 10. User Order History List
  it('should list all orders for the authenticated user with pagination', async () => {
    // Place order 1
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });
    await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId });

    // Place order 2
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 });
    await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddressId: addressId });

    const res = await request(app)
      .get('/api/v1/orders?page=1&limit=10')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(HTTP_STATUS.OK);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.page).toBe(1);
  });
  it("should handle concurrent checkouts for the last available item: exactly one succeeds and the other receives 422", async () => {
    // 1. Set stock to exactly 1
    await prisma.inventory.update({ where: { variantId }, data: { quantity: 1 } });

    // 2. Both users add the item to their cart
    await request(app)
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 })
      .expect(HTTP_STATUS.OK);

    await request(app)
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${otherCustomerToken}`)
      .send({ variantId, quantity: 1 })
      .expect(HTTP_STATUS.OK);

    // 3. Execute checkouts simultaneously
    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/v1/orders/checkout")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ shippingAddressId: addressId }),
      request(app)
        .post("/api/v1/orders/checkout")
        .set("Authorization", `Bearer ${otherCustomerToken}`)
        .send({ shippingAddressId: otherUserAddressId }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([HTTP_STATUS.CREATED, HTTP_STATUS.UNPROCESSABLE]);

    const failedRes = res1.status === HTTP_STATUS.UNPROCESSABLE ? res1 : res2;
    expect(failedRes.body.success).toBe(false);
    expect(failedRes.body.message).toContain("Insufficient stock");

    // 4. Verify inventory in database is exactly 0 (never negative)
    const inv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(inv?.quantity).toBe(0);
  });
});
