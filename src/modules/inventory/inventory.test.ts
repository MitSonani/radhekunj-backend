/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { appConfig } from '../../config/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

const app = createApp();

describe('Admin Inventory Module', () => {
  let adminId: string;
  let adminToken: string;
  let customerId: string;
  let customerToken: string;
  let categoryId: string;
  let productId: string;
  let variantId1: string; // SKU: TEE-BLK-M (qty: 15, reserved: 2, threshold: 5) -> available 13 -> IN_STOCK
  let variantId2: string; // SKU: TEE-BLK-L (qty: 4, reserved: 0, threshold: 5) -> available 4 -> LOW_STOCK
  let variantId3: string; // SKU: TEE-BLK-XL (qty: 0, reserved: 0, threshold: 5) -> available 0 -> OUT_OF_STOCK

  beforeEach(async () => {
    // 1. Roles
    const adminRole = await prisma.role.create({ data: { name: 'admin' } });
    const customerRole = await prisma.role.create({ data: { name: 'customer' } });

    // 2. Users
    const adminUser = await prisma.user.create({
      data: {
        name: 'Inventory Admin',
        mobileNumber: '+919876543210',
        countryCode: '+91',
        roleId: adminRole.id,
      },
    });
    adminId = adminUser.id;
    adminToken = jwt.sign(
      { id: adminUser.id, role: 'admin', mobileNumber: adminUser.mobileNumber },
      appConfig.jwtSecret,
    );

    const customerUser = await prisma.user.create({
      data: {
        name: 'Regular Customer',
        mobileNumber: '+919876543211',
        countryCode: '+91',
        roleId: customerRole.id,
      },
    });
    customerId = customerUser.id;
    customerToken = jwt.sign(
      { id: customerUser.id, role: 'customer', mobileNumber: customerUser.mobileNumber },
      appConfig.jwtSecret,
    );

    // 3. Category & Attributes
    const category = await prisma.category.create({
      data: { name: 'T-Shirts', slug: 't-shirts', status: 'ACTIVE' },
    });
    categoryId = category.id;

    const sizeAttr = await prisma.attribute.create({
      data: { name: 'Size', slug: 'size' },
    });
    const sizeM = await prisma.attributeValue.create({
      data: { attributeId: sizeAttr.id, value: 'M', slug: 'm' },
    });
    const sizeL = await prisma.attributeValue.create({
      data: { attributeId: sizeAttr.id, value: 'L', slug: 'l' },
    });
    const sizeXL = await prisma.attributeValue.create({
      data: { attributeId: sizeAttr.id, value: 'XL', slug: 'xl' },
    });

    // 4. Product with 3 variants
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: 'Classic Organic Cotton Tee',
        slug: 'classic-organic-cotton-tee',
        basePrice: 999.0,
        status: 'ACTIVE',
      },
    });
    productId = product.id;

    // Variant 1: 15 qty, 2 reserved -> available 13 (IN_STOCK)
    const v1 = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'COTTON-TEE-M',
        price: 999.0,
        status: 'ACTIVE',
        attributes: { create: [{ attributeValueId: sizeM.id }] },
        inventory: {
          create: { quantity: 15, reservedQuantity: 2, lowStockThreshold: 5 },
        },
      },
    });
    variantId1 = v1.id;

    // Variant 2: 4 qty, 0 reserved -> available 4 (LOW_STOCK)
    const v2 = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'COTTON-TEE-L',
        price: 999.0,
        status: 'ACTIVE',
        attributes: { create: [{ attributeValueId: sizeL.id }] },
        inventory: {
          create: { quantity: 4, reservedQuantity: 0, lowStockThreshold: 5 },
        },
      },
    });
    variantId2 = v2.id;

    // Variant 3: 0 qty, 0 reserved -> available 0 (OUT_OF_STOCK)
    const v3 = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'COTTON-TEE-XL',
        price: 999.0,
        status: 'ACTIVE',
        attributes: { create: [{ attributeValueId: sizeXL.id }] },
        inventory: {
          create: { quantity: 0, reservedQuantity: 0, lowStockThreshold: 5 },
        },
      },
    });
    variantId3 = v3.id;
  });

  describe('Authorization', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/admin/inventory/dashboard');
      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('rejects non-admin customer requests with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inventory/dashboard')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
  });

  describe('Inventory Dashboard', () => {
    it('accurately calculates stock counts, breakdowns, and valuation', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inventory/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data.totalProducts).toBe(1);
      expect(data.totalVariants).toBe(3);
      expect(data.totalStock).toBe(19); // 15 + 4 + 0
      expect(data.totalReservedStock).toBe(2);
      expect(data.totalAvailableStock).toBe(17); // 19 - 2
      expect(data.lowStockVariantsCount).toBe(1); // Variant 2
      expect(data.outOfStockVariantsCount).toBe(1); // Variant 3

      // Stock status breakdown: 1 in stock, 1 low stock, 1 out of stock
      expect(data.stockStatusBreakdown).toEqual({
        inStock: 1,
        lowStock: 1,
        outOfStock: 1,
      });

      // Valuation: 19 units * 999.00 = 18981.00
      expect(data.inventoryValuation.retailValue).toBe('18981.00');
      expect(data.inventoryValuation.valuationMethod).toContain('Retail Value');
      expect(data.inventoryValuation.currency).toBe('INR');
    });
  });

  describe('Inventory Listing & Filtering', () => {
    it('returns paginated variants with stock status and category info', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inventory')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.pagination.total).toBe(3);

      const item1 = res.body.data.find((item: any) => item.variantId === variantId1);
      expect(item1).toBeDefined();
      expect(item1.sku).toBe('COTTON-TEE-M');
      expect(item1.quantity).toBe(15);
      expect(item1.reservedQuantity).toBe(2);
      expect(item1.availableStock).toBe(13);
      expect(item1.stockStatus).toBe('IN_STOCK');
      expect(item1.category.name).toBe('T-Shirts');
    });

    it('filters inventory by stockStatus = LOW_STOCK', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inventory?stockStatus=LOW_STOCK')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].variantId).toBe(variantId2);
      expect(res.body.data[0].stockStatus).toBe('LOW_STOCK');
    });

    it('filters inventory by stockStatus = OUT_OF_STOCK', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inventory?stockStatus=OUT_OF_STOCK')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].variantId).toBe(variantId3);
      expect(res.body.data[0].stockStatus).toBe('OUT_OF_STOCK');
    });

    it('searches inventory by SKU or product name', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inventory?search=TEE-XL')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].sku).toBe('COTTON-TEE-XL');
    });

    it('filters inventory by categoryId', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/inventory?categoryId=${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data).toHaveLength(3);
    });
  });

  describe('Stock Adjustments (ADD, REMOVE, SET, CORRECTION)', () => {
    it('1. Adds stock and logs STOCK_RECEIVED movement with audit details', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/inventory/${variantId1}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'ADD',
          quantity: 10,
          reason: 'Supplier shipment arrived (PO-8821)',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.item.quantity).toBe(25); // 15 + 10
      expect(res.body.data.item.availableStock).toBe(23); // 25 - 2
      expect(res.body.data.movement.type).toBe('STOCK_RECEIVED');
      expect(res.body.data.movement.previousQuantity).toBe(15);
      expect(res.body.data.movement.quantityChange).toBe(10);
      expect(res.body.data.movement.newQuantity).toBe(25);
      expect(res.body.data.movement.admin.id).toBe(adminId);
    });

    it('2. Removes stock and logs MANUAL_ADJUSTMENT movement', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/inventory/${variantId1}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'REMOVE',
          quantity: 3,
          reason: 'Damaged packaging during storage',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.item.quantity).toBe(12); // 15 - 3
      expect(res.body.data.movement.type).toBe('MANUAL_ADJUSTMENT');
      expect(res.body.data.movement.previousQuantity).toBe(15);
      expect(res.body.data.movement.quantityChange).toBe(-3);
      expect(res.body.data.movement.newQuantity).toBe(12);
    });

    it('3. Sets stock and logs MANUAL_ADJUSTMENT movement', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/inventory/${variantId1}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'SET',
          quantity: 20,
          reason: 'Inventory count reset',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.item.quantity).toBe(20);
      expect(res.body.data.movement.previousQuantity).toBe(15);
      expect(res.body.data.movement.quantityChange).toBe(5);
      expect(res.body.data.movement.newQuantity).toBe(20);
    });

    it('4. Records physical stock correction audit', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/inventory/${variantId1}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'CORRECTION',
          quantity: 14,
          reason: 'Physical cycle count discrepancy audit',
          notes: 'Found 1 mislabeled unit during quarterly review',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.item.quantity).toBe(14);
      expect(res.body.data.movement.type).toBe('STOCK_CORRECTION');
      expect(res.body.data.movement.quantityChange).toBe(-1);
    });

    it('5. Rejects stock reduction that would drop below reserved quantity', async () => {
      // variantId1 has 15 total, 2 reserved.
      // Trying to remove 14 units would leave 1, which is less than reserved (2).
      const res = await request(app)
        .post(`/api/v1/admin/inventory/${variantId1}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'REMOVE',
          quantity: 14,
          reason: 'Trying to remove too much',
        });

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
      expect(res.body.message).toContain('reserved quantity');
    });

    it('6. Rejects negative stock adjustments', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/inventory/${variantId3}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'REMOVE',
          quantity: 5,
          reason: 'Attempting negative stock',
        });

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
    });

    it('7. Rejects adjustment without a descriptive reason', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/inventory/${variantId1}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'ADD',
          quantity: 5,
          reason: '',
        });

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
    });
  });

  describe('Configurable Low Stock Thresholds', () => {
    it('updates variant low stock threshold and re-evaluates stockStatus', async () => {
      // variantId1 currently has 13 available stock and threshold 5 -> IN_STOCK.
      // If we increase threshold to 15, available 13 becomes LOW_STOCK!
      const res = await request(app)
        .patch(`/api/v1/admin/inventory/${variantId1}/threshold`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ lowStockThreshold: 15 });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.lowStockThreshold).toBe(15);
      expect(res.body.data.stockStatus).toBe('LOW_STOCK');

      // Verify dashboard now counts 2 low stock items
      const dash = await request(app)
        .get('/api/v1/admin/inventory/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(dash.body.data.lowStockVariantsCount).toBe(2);
    });

    it('manages store-wide inventory settings', async () => {
      const getRes = await request(app)
        .get('/api/v1/admin/inventory/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.status).toBe(HTTP_STATUS.OK);
      expect(getRes.body.data.defaultLowStockThreshold).toBe(5);

      const patchRes = await request(app)
        .patch('/api/v1/admin/inventory/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ defaultLowStockThreshold: 8 });

      expect(patchRes.status).toBe(HTTP_STATUS.OK);
      expect(patchRes.body.data.defaultLowStockThreshold).toBe(8);
    });
  });

  describe('Stock Movement Audit History', () => {
    it('returns chronological stock movement audit logs with search & filters', async () => {
      // Perform 2 manual adjustments
      await request(app)
        .post(`/api/v1/admin/inventory/${variantId1}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'ADD', quantity: 10, reason: 'Restock lot A' });

      await request(app)
        .post(`/api/v1/admin/inventory/${variantId2}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'REMOVE', quantity: 2, reason: 'Expired fabric lot' });

      const res = await request(app)
        .get('/api/v1/admin/inventory/movements')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const first = res.body.data[0];
      expect(first.admin.id).toBe(adminId);
      expect(first.sku).toBeDefined();
      expect(first.productName).toBe('Classic Organic Cotton Tee');

      // Filter by variantId
      const filteredRes = await request(app)
        .get(`/api/v1/admin/inventory/movements?variantId=${variantId2}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(filteredRes.body.data).toHaveLength(1);
      expect(filteredRes.body.data[0].variantId).toBe(variantId2);
      expect(filteredRes.body.data[0].quantityChange).toBe(-2);
    });
  });
});
