/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { appConfig } from '../../config/index.js';
import { OrderStatus, PaymentMethod, PaymentStatus, RefundStatus } from '@prisma/client';

const app = createApp();

describe('Admin Analytics Dashboard API', () => {
  let adminToken: string;
  let customerToken: string;
  let _adminUserId: string;
  let customerUserId: string;

  beforeEach(async () => {
    // Clean tables
    await prisma.refund.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.couponUsage.deleteMany();
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();

    // Create roles
    const adminRole = await prisma.role.create({ data: { name: 'admin' } });
    const customerRole = await prisma.role.create({ data: { name: 'customer' } });

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        mobileNumber: '9999900000',
        countryCode: '+91',
        name: 'Admin User',
        roleId: adminRole.id,
      },
    });
    _adminUserId = adminUser.id;
    adminToken = jwt.sign({ id: adminUser.id }, appConfig.jwtSecret);

    // Create customer user
    const customerUser = await prisma.user.create({
      data: {
        mobileNumber: '9888800000',
        countryCode: '+91',
        name: 'Test Customer',
        roleId: customerRole.id,
      },
    });
    customerUserId = customerUser.id;
    customerToken = jwt.sign({ id: customerUser.id }, appConfig.jwtSecret);
  });

  describe('Authorization', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/admin/analytics/dashboard');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin customers with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/dashboard')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Empty Dataset State', () => {
    it('returns zeroed KPIs and empty lists for empty store', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/dashboard?range=7d')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { kpis, timeSeries, topProducts, recentOrders } = res.body.data;
      expect(kpis.grossOrderValue).toBe(0);
      expect(kpis.netCollectedRevenue).toBe(0);
      expect(kpis.orderCount).toBe(0);
      expect(kpis.averageOrderValue).toBe(0);
      expect(timeSeries).toHaveLength(7);
      expect(topProducts).toEqual([]);
      expect(recentOrders).toEqual([]);
    });
  });

  describe('Metric Aggregations & Calculations', () => {
    it('accurately calculates gross revenue, collected revenue, refunds, and excludes cancelled orders', async () => {
      const category = await prisma.category.create({ data: { name: 'Apparel', slug: 'apparel' } });
      const product = await prisma.product.create({
        data: { name: 'Silk Shirt', slug: 'silk-shirt', categoryId: category.id, basePrice: 2000 },
      });
      const variant = await prisma.productVariant.create({
        data: { sku: 'SS-01', price: 2000, productId: product.id },
      });
      await prisma.inventory.create({
        data: { variantId: variant.id, quantity: 20, reservedQuantity: 0 },
      });

      // 1. Order 1: Razorpay PAID (Confirmed) - ₹4000
      const order1 = await prisma.order.create({
        data: {
          orderNumber: 'ORD-TEST-001',
          userId: customerUserId,
          status: OrderStatus.CONFIRMED,
          subtotal: 4000,
          discountAmount: 0,
          shippingFee: 0,
          taxAmount: 0,
          totalAmount: 4000,
          shippingAddress: { city: 'Surat' },
          items: {
            create: {
              productId: product.id,
              variantId: variant.id,
              sku: variant.sku,
              productName: product.name,
              attributes: [],
              unitPrice: 2000,
              quantity: 2,
              lineTotal: 4000,
            },
          },
        },
      });

      const payment1 = await prisma.payment.create({
        data: {
          orderId: order1.id,
          paymentMethod: PaymentMethod.RAZORPAY,
          paymentStatus: PaymentStatus.PAID,
          amount: 4000,
          paidAt: new Date(),
        },
      });

      // Partial refund on order 1: ₹1000
      await prisma.refund.create({
        data: {
          orderId: order1.id,
          paymentId: payment1.id,
          amount: 1000,
          status: RefundStatus.PROCESSED,
        },
      });

      // 2. Order 2: COD PENDING (Confirmed) - ₹2000
      // COD not yet collected -> should NOT count as collected revenue!
      const order2 = await prisma.order.create({
        data: {
          orderNumber: 'ORD-TEST-002',
          userId: customerUserId,
          status: OrderStatus.CONFIRMED,
          subtotal: 2000,
          discountAmount: 0,
          shippingFee: 0,
          taxAmount: 0,
          totalAmount: 2000,
          shippingAddress: { city: 'Ahmedabad' },
          items: {
            create: {
              productId: product.id,
              variantId: variant.id,
              sku: variant.sku,
              productName: product.name,
              attributes: [],
              unitPrice: 2000,
              quantity: 1,
              lineTotal: 2000,
            },
          },
        },
      });

      await prisma.payment.create({
        data: {
          orderId: order2.id,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PENDING,
          amount: 2000,
        },
      });

      // 3. Order 3: Cancelled order - ₹6000
      // Should NOT count in gross order value!
      await prisma.order.create({
        data: {
          orderNumber: 'ORD-TEST-003',
          userId: customerUserId,
          status: OrderStatus.CANCELLED,
          subtotal: 6000,
          discountAmount: 0,
          shippingFee: 0,
          taxAmount: 0,
          totalAmount: 6000,
          shippingAddress: { city: 'Mumbai' },
          items: {
            create: {
              productId: product.id,
              variantId: variant.id,
              sku: variant.sku,
              productName: product.name,
              attributes: [],
              unitPrice: 2000,
              quantity: 3,
              lineTotal: 6000,
            },
          },
        },
      });

      // Fetch dashboard
      const res = await request(app)
        .get('/api/v1/admin/analytics/dashboard?range=today')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Gross order value: order1 (4000) + order2 (2000) = 6000. Cancelled order 3 (6000) excluded!
      expect(data.kpis.grossOrderValue).toBe(6000);

      // Order counts
      expect(data.kpis.orderCount).toBe(3);
      expect(data.kpis.nonCancelledOrderCount).toBe(2);
      expect(data.kpis.cancelledOrderCount).toBe(1);

      // Average order value = 6000 / 2 = 3000
      expect(data.kpis.averageOrderValue).toBe(3000);

      // Collected revenue = Order 1 paid (4000) - refund (1000) = 3000. COD pending (2000) NOT counted!
      expect(data.kpis.netCollectedRevenue).toBe(3000);
      expect(data.kpis.totalRefunds).toBe(1000);

      // Top products verification
      expect(data.topProducts).toHaveLength(1);
      expect(data.topProducts[0].productName).toBe('Silk Shirt');
      expect(data.topProducts[0].unitsSold).toBe(3); // 2 from order1 + 1 from order2 (cancelled order3 excluded)
      expect(data.topProducts[0].revenue).toBe(6000);

      // Payment breakdown
      expect(data.paymentBreakdown.byMethod.razorpay.count).toBe(1);
      expect(data.paymentBreakdown.byMethod.razorpay.collectedAmount).toBe(4000);
      expect(data.paymentBreakdown.byMethod.cod.count).toBe(1);
      expect(data.paymentBreakdown.byMethod.cod.collectedAmount).toBe(0); // pending COD
    });

    it('rejects invalid custom date ranges with 400', async () => {
      // Missing endDate
      const res1 = await request(app)
        .get('/api/v1/admin/analytics/dashboard?range=custom&startDate=2026-01-01')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res1.status).toBe(400);

      // startDate after endDate
      const res2 = await request(app)
        .get('/api/v1/admin/analytics/dashboard?range=custom&startDate=2026-12-31&endDate=2026-01-01')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2.status).toBe(400);
    });

    it('accurately identifies low stock and out of stock inventory', async () => {
      const category = await prisma.category.create({ data: { name: 'Fabrics', slug: 'fabrics' } });
      const product = await prisma.product.create({
        data: { name: 'Linen Dress', slug: 'linen-dress', categoryId: category.id, basePrice: 1500 },
      });

      // Low stock variant (3 in stock)
      const var1 = await prisma.productVariant.create({
        data: { sku: 'LD-LOW', price: 1500, productId: product.id },
      });
      await prisma.inventory.create({
        data: { variantId: var1.id, quantity: 3, reservedQuantity: 1 },
      });

      // Out of stock variant (0 in stock)
      const var2 = await prisma.productVariant.create({
        data: { sku: 'LD-OUT', price: 1500, productId: product.id },
      });
      await prisma.inventory.create({
        data: { variantId: var2.id, quantity: 0, reservedQuantity: 0 },
      });

      const res = await request(app)
        .get('/api/v1/admin/analytics/dashboard?range=today')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const { inventory } = res.body.data;
      expect(inventory.lowStockCount).toBe(1);
      expect(inventory.outOfStockCount).toBe(1);
      expect(inventory.lowStockItems[0].sku).toBe('LD-LOW');
      expect(inventory.lowStockItems[0].quantity).toBe(3);
      expect(inventory.lowStockItems[0].availableStock).toBe(2);
    });
  });
});
