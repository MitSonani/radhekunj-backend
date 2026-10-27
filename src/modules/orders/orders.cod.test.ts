/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { appConfig } from '../../config/index.js';
import { setCodConfig } from '../financial/service.js';

const app = createApp();

let customerId: string;
let customerToken: string;
let addressIdMumbai: string;
let addressIdDelhi: string;
let affordableVariantId: string;
let luxuryVariantId: string;

async function cleanDatabase() {
  await prisma.orderItem.deleteMany({});
  await prisma.couponUsage.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.cartItem.deleteMany({});
  await prisma.cart.deleteMany({});
  await prisma.inventory.deleteMany({});
  await prisma.productVariantAttribute.deleteMany({});
  await prisma.productVariant.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.attributeValue.deleteMany({});
  await prisma.attribute.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.address.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.storeSetting.deleteMany({});
}

async function seedData() {
  const customerRole = await prisma.role.create({ data: { name: 'customer' } });

  const user = await prisma.user.create({
    data: {
      name: 'COD Test Customer',
      mobileNumber: '+919876543219',
      countryCode: '+91',
      roleId: customerRole.id,
    },
  });
  customerId = user.id;
  customerToken = jwt.sign(
    { id: user.id, role: 'customer', mobileNumber: user.mobileNumber },
    appConfig.jwtSecret,
  );

  const addr1 = await prisma.address.create({
    data: {
      userId: customerId,
      fullName: 'COD Customer',
      countryCode: '+91',
      mobileNumber: '9876543219',
      addressLine1: 'Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400002',
      country: 'India',
      isDefault: true,
    },
  });
  addressIdMumbai = addr1.id;

  const addr2 = await prisma.address.create({
    data: {
      userId: customerId,
      fullName: 'COD Customer Remote',
      countryCode: '+91',
      mobileNumber: '9876543219',
      addressLine1: 'Connaught Place',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110001',
      country: 'India',
    },
  });
  addressIdDelhi = addr2.id;

  const category = await prisma.category.create({
    data: { name: 'Apparel', slug: 'apparel', status: 'ACTIVE' },
  });

  const affordableProd = await prisma.product.create({
    data: { name: 'Cotton Kurta', slug: 'cotton-kurta', basePrice: 2000, categoryId: category.id, status: 'ACTIVE' },
  });
  const affVar = await prisma.productVariant.create({
    data: { productId: affordableProd.id, sku: 'CK-01', price: 2000, status: 'ACTIVE' },
  });
  await prisma.inventory.create({ data: { variantId: affVar.id, quantity: 20, reservedQuantity: 0 } });
  affordableVariantId = affVar.id;

  const luxuryProd = await prisma.product.create({
    data: { name: 'Bridal Lehenga', slug: 'bridal-lehenga', basePrice: 25000, categoryId: category.id, status: 'ACTIVE' },
  });
  const luxVar = await prisma.productVariant.create({
    data: { productId: luxuryProd.id, sku: 'BL-01', price: 25000, status: 'ACTIVE' },
  });
  await prisma.inventory.create({ data: { variantId: luxVar.id, quantity: 5, reservedQuantity: 0 } });
  luxuryVariantId = luxVar.id;
}

describe('Cash on Delivery (COD) Eligibility & Checkout Enforcement Suite', () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedData();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe('GET /api/v1/orders/cod-eligibility', () => {
    it('1. Returns eligible when order amount is under threshold', async () => {
      await setCodConfig({ enabled: true, maxOrderValue: 15000 });

      const res = await request(app)
        .get('/api/v1/orders/cod-eligibility?amount=5000&postalCode=400002')
        .expect(HTTP_STATUS.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isEligible).toBe(true);
      expect(res.body.data.maxOrderValue).toBe(15000);
    });

    it('2. Returns ineligible when order amount exceeds maxOrderValue', async () => {
      await setCodConfig({ enabled: true, maxOrderValue: 15000 });

      const res = await request(app)
        .get('/api/v1/orders/cod-eligibility?amount=20000&postalCode=400002')
        .expect(HTTP_STATUS.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isEligible).toBe(false);
      expect(res.body.data.reason).toContain('orders above ₹15,000');
    });

    it('3. Returns ineligible when COD is disabled globally in store settings', async () => {
      await setCodConfig({ enabled: false, maxOrderValue: 15000 });

      const res = await request(app)
        .get('/api/v1/orders/cod-eligibility?amount=1000')
        .expect(HTTP_STATUS.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isEligible).toBe(false);
      expect(res.body.data.reason).toContain('Cash on Delivery is currently unavailable');
    });

    it('4. Returns ineligible when postal code is not in allowed service list', async () => {
      await setCodConfig({ enabled: true, maxOrderValue: 15000, allowedPostalCodes: ['400002'] });

      const res = await request(app)
        .get('/api/v1/orders/cod-eligibility?amount=1000&postalCode=110001')
        .expect(HTTP_STATUS.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isEligible).toBe(false);
      expect(res.body.data.reason).toContain('not serviceable for postal code 110001');
    });
  });

  describe('POST /api/v1/orders/checkout COD Enforcement', () => {
    it('5. Allows placing COD order when order value is below limit', async () => {
      await setCodConfig({ enabled: true, maxOrderValue: 15000 });

      // Add affordable product (₹2000) to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: affordableVariantId, quantity: 1 })
        .expect(HTTP_STATUS.OK);

      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ shippingAddressId: addressIdMumbai, paymentMethod: 'COD' });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.paymentMethod).toBe('COD');
    });

    it('6. Rejects COD order checkout with 422 when total exceeds maxOrderValue', async () => {
      await setCodConfig({ enabled: true, maxOrderValue: 15000 });

      // Add luxury product (₹25000) to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: luxuryVariantId, quantity: 1 })
        .expect(HTTP_STATUS.OK);

      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ shippingAddressId: addressIdMumbai, paymentMethod: 'COD' });

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('Cash on Delivery is not available for orders above');
    });

    it('7. Rejects COD order checkout with 422 when COD is disabled globally', async () => {
      await setCodConfig({ enabled: false, maxOrderValue: 15000 });

      // Add affordable product (₹2000) to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: affordableVariantId, quantity: 1 })
        .expect(HTTP_STATUS.OK);

      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ shippingAddressId: addressIdMumbai, paymentMethod: 'COD' });

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('Cash on Delivery is currently unavailable');
    });

    it('8. Rejects COD order checkout with 422 when postal code is not in allowlist', async () => {
      await setCodConfig({ enabled: true, maxOrderValue: 15000, allowedPostalCodes: ['400002'] });

      // Add affordable product (₹2000) to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: affordableVariantId, quantity: 1 })
        .expect(HTTP_STATUS.OK);

      // Attempt checkout to Delhi address (110001)
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ shippingAddressId: addressIdDelhi, paymentMethod: 'COD' });

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('not serviceable for postal code 110001');
    });

    it('9. Razorpay orders bypass COD limits without error', async () => {
      await setCodConfig({ enabled: true, maxOrderValue: 15000 });

      // Add luxury product (₹25000) to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: luxuryVariantId, quantity: 1 })
        .expect(HTTP_STATUS.OK);

      // Checkout with RAZORPAY
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ shippingAddressId: addressIdMumbai, paymentMethod: 'RAZORPAY' });

      // Should succeed and create order in PENDING_PAYMENT status
      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING_PAYMENT');
      expect(res.body.data.paymentMethod).toBe('RAZORPAY');
    });
  });
});
