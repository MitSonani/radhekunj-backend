/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { appConfig } from '../../config/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

const app = createApp();

describe('Cart Merge & Guest Cart Transition Suite', () => {
  let _customerId: string;
  let customerToken: string;
  let activeVariantId1: string;
  let activeVariantId2: string;
  let inactiveVariantId: string;
  let outOfStockVariantId: string;

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

    // 2. Roles and User
    const customerRole = await prisma.role.create({ data: { name: 'customer' } });
    const user = await prisma.user.create({
      data: {
        name: 'Guest Convert',
        mobileNumber: '+919876500001',
        countryCode: '+91',
        roleId: customerRole.id,
      },
    });
    _customerId = user.id;
    customerToken = jwt.sign(
      { id: user.id, role: 'customer', mobileNumber: user.mobileNumber },
      appConfig.jwtSecret,
    );

    // 3. Products and Variants
    const category = await prisma.category.create({
      data: { name: 'Anarkali', slug: 'anarkali', status: 'ACTIVE' },
    });

    const productActive = await prisma.product.create({
      data: { name: 'Chanderi Kurti', slug: 'chanderi-kurti', basePrice: 1200, categoryId: category.id, status: 'ACTIVE' },
    });

    const v1 = await prisma.productVariant.create({
      data: { productId: productActive.id, sku: 'CHAN-S', price: 1200, status: 'ACTIVE' },
    });
    activeVariantId1 = v1.id;
    await prisma.inventory.create({ data: { variantId: v1.id, quantity: 10, reservedQuantity: 0 } });

    const v2 = await prisma.productVariant.create({
      data: { productId: productActive.id, sku: 'CHAN-M', price: 1200, status: 'ACTIVE' },
    });
    activeVariantId2 = v2.id;
    await prisma.inventory.create({ data: { variantId: v2.id, quantity: 5, reservedQuantity: 0 } });

    const vInactive = await prisma.productVariant.create({
      data: { productId: productActive.id, sku: 'CHAN-DISCONTINUED', price: 1200, status: 'INACTIVE' },
    });
    inactiveVariantId = vInactive.id;
    await prisma.inventory.create({ data: { variantId: vInactive.id, quantity: 10, reservedQuantity: 0 } });

    const vOos = await prisma.productVariant.create({
      data: { productId: productActive.id, sku: 'CHAN-OOS', price: 1200, status: 'ACTIVE' },
    });
    outOfStockVariantId = vOos.id;
    await prisma.inventory.create({ data: { variantId: vOos.id, quantity: 0, reservedQuantity: 0 } });
  });

  it('1. Merges guest items into an empty user cart accurately', async () => {
    const res = await request(app)
      .post('/api/v1/cart/merge')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [
          { variantId: activeVariantId1, quantity: 2 },
          { variantId: activeVariantId2, quantity: 1 },
        ],
      })
      .expect(HTTP_STATUS.OK);

    const cart = res.body.data;
    expect(cart.itemsCount).toBe(2);
    expect(cart.totalQuantity).toBe(3);
    expect(cart.subtotal).toBe('3600.00'); // (2 + 1) * 1200
  });

  it('2. Combines quantities when guest item already exists in user cart, capped at available stock', async () => {
    // 1. Add 2 units of variant 1 to user cart
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId: activeVariantId1, quantity: 2 })
      .expect(HTTP_STATUS.OK);

    // 2. Merge guest cart with 3 units of variant 1 (total stock is 10)
    const res = await request(app)
      .post('/api/v1/cart/merge')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: activeVariantId1, quantity: 3 }],
      })
      .expect(HTTP_STATUS.OK);

    const cart = res.body.data;
    expect(cart.itemsCount).toBe(1);
    expect(cart.totalQuantity).toBe(5); // 2 + 3
  });

  it('3. Gracefully skips inactive and out-of-stock variants without throwing error', async () => {
    const res = await request(app)
      .post('/api/v1/cart/merge')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [
          { variantId: activeVariantId1, quantity: 2 },
          { variantId: inactiveVariantId, quantity: 1 },
          { variantId: outOfStockVariantId, quantity: 1 },
        ],
      })
      .expect(HTTP_STATUS.OK);

    const cart = res.body.data;
    // Only the active, in-stock variant should be added
    expect(cart.itemsCount).toBe(1);
    expect(cart.items[0].variantId).toBe(activeVariantId1);
    expect(cart.totalQuantity).toBe(2);
  });

  it('4. Repeated merge requests do not exceed available stock', async () => {
    // Variant 2 has only 5 available
    // First merge: 4 units
    await request(app)
      .post('/api/v1/cart/merge')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: activeVariantId2, quantity: 4 }],
      })
      .expect(HTTP_STATUS.OK);

    // Second duplicate merge: 4 units again (total requested 8, but stock is 5)
    const res = await request(app)
      .post('/api/v1/cart/merge')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: activeVariantId2, quantity: 4 }],
      })
      .expect(HTTP_STATUS.OK);

    const cart = res.body.data;
    expect(cart.itemsCount).toBe(1);
    expect(cart.totalQuantity).toBe(5); // Capped at available stock of 5
  });
});
