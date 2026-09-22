/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { appConfig } from '../../config/index.js';

const app = createApp();
const hour = 60 * 60 * 1000;

let adminToken: string;
let customerToken: string;
let customerId: string;
let menCategoryId: string;
let womenCategoryId: string;
let tshirtProductId: string;
let jeansProductId: string;
let tshirtVariantId: string;

async function cleanDatabase() {
  await prisma.couponUsage.deleteMany({});
  await prisma.couponProduct.deleteMany({});
  await prisma.couponCategory.deleteMany({});
  await prisma.cartItem.deleteMany({});
  await prisma.cart.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.inventory.deleteMany({});
  await prisma.productVariantAttribute.deleteMany({});
  await prisma.productVariant.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.attributeValue.deleteMany({});
  await prisma.attribute.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
}

function dates(startsOffset = -hour, expiresOffset = 24 * hour) {
  return {
    startsAt: new Date(Date.now() + startsOffset).toISOString(),
    expiresAt: new Date(Date.now() + expiresOffset).toISOString(),
  };
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createCoupon(body: Record<string, unknown>, token = adminToken) {
  return request(app).post('/api/v1/admin/coupons').set(authHeader(token)).send(body);
}

async function listCoupons(query: Record<string, string> = {}, token = adminToken) {
  return request(app).get('/api/v1/admin/coupons').query(query).set(authHeader(token));
}

beforeEach(async () => {
  await cleanDatabase();

  const adminRole = await prisma.role.create({ data: { name: 'admin' } });
  const customerRole = await prisma.role.create({ data: { name: 'customer' } });

  const adminUser = await prisma.user.create({
    data: { name: 'Admin User', mobileNumber: '9999999990', roleId: adminRole.id },
  });
  const customerUser = await prisma.user.create({
    data: { name: 'Customer User', mobileNumber: '8888888881', roleId: customerRole.id },
  });

  customerId = customerUser.id;
  adminToken = jwt.sign({ id: adminUser.id }, appConfig.jwtSecret);
  customerToken = jwt.sign({ id: customerUser.id }, appConfig.jwtSecret);

  const men = await prisma.category.create({ data: { name: 'Men', slug: 'men' } });
  const women = await prisma.category.create({ data: { name: 'Women', slug: 'women' } });
  menCategoryId = men.id;
  womenCategoryId = women.id;

  const color = await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });
  const size = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
  const colorBlack = await prisma.attributeValue.create({
    data: { attributeId: color.id, value: 'Black', slug: 'black' },
  });
  const sizeM = await prisma.attributeValue.create({
    data: { attributeId: size.id, value: 'M', slug: 'm' },
  });

  const tshirt = await prisma.product.create({
    data: {
      name: 'Premium T-Shirt',
      slug: 'premium-t-shirt',
      basePrice: '1000.00',
      categoryId: menCategoryId,
      variants: {
        create: {
          sku: 'ADM-TSH-BLK-M',
          price: '1000.00',
          status: 'ACTIVE',
          attributes: {
            create: [{ attributeValueId: colorBlack.id }, { attributeValueId: sizeM.id }],
          },
          inventory: { create: { quantity: 10, reservedQuantity: 0 } },
        },
      },
    },
    select: { id: true, variants: { select: { id: true } } },
  });
  tshirtProductId = tshirt.id;
  tshirtVariantId = tshirt.variants[0]!.id;

  const jeans = await prisma.product.create({
    data: {
      name: 'Straight Jeans',
      slug: 'straight-jeans',
      basePrice: '2000.00',
      categoryId: menCategoryId,
      variants: {
        create: {
          sku: 'ADM-JNS-BLK-M',
          price: '2000.00',
          status: 'ACTIVE',
          inventory: { create: { quantity: 10, reservedQuantity: 0 } },
        },
      },
    },
    select: { id: true },
  });
  jeansProductId = jeans.id;
});

afterAll(async () => {
  await cleanDatabase();
});

describe('Admin Coupons — Authorization', () => {
  it('1. Unauthenticated cannot access', async () => {
    const res = await request(app).get('/api/v1/admin/coupons');
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('2-6. Customer cannot create, list, update, activate, or deactivate', async () => {
    const created = await createCoupon({
      code: 'SAVE20',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      scope: 'CART',
      ...dates(),
    });
    expect(created.status).toBe(HTTP_STATUS.CREATED);
    const couponId = created.body.data.id;

    const attempts = await Promise.all([
      createCoupon(
        { code: 'X', discountType: 'PERCENTAGE', discountValue: 10, scope: 'CART', ...dates() },
        customerToken,
      ),
      listCoupons({}, customerToken),
      request(app)
        .patch(`/api/v1/admin/coupons/${couponId}`)
        .set(authHeader(customerToken))
        .send({ status: 'INACTIVE' }),
      request(app)
        .patch(`/api/v1/admin/coupons/${couponId}/activate`)
        .set(authHeader(customerToken)),
      request(app)
        .patch(`/api/v1/admin/coupons/${couponId}/deactivate`)
        .set(authHeader(customerToken)),
    ]);

    for (const res of attempts) {
      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    }
  });

  it('3. Admin can access the list', async () => {
    const res = await listCoupons();
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
  });
});

describe('Admin Coupons — Create', () => {
  it('7-16. Creates CART / PRODUCT / CATEGORY, percentage / fixed, limits and dates', async () => {
    const cart = await createCoupon({
      code: 'save20',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      scope: 'CART',
      minimumCartValue: 3000,
      maximumDiscount: 1000,
      usageLimit: 1000,
      perUserLimit: 1,
      status: 'ACTIVE',
      ...dates(),
    });
    expect(cart.status).toBe(HTTP_STATUS.CREATED);
    expect(cart.body.data).toMatchObject({
      code: 'SAVE20',
      discountType: 'PERCENTAGE',
      discountValue: '20.00',
      scope: 'CART',
      minimumCartValue: '3000.00',
      maximumDiscount: '1000.00',
      usageLimit: 1000,
      usageCount: 0,
      perUserLimit: 1,
      status: 'ACTIVE',
      validity: 'CURRENT',
    });
    expect(cart.body.data.products).toEqual([]);
    expect(cart.body.data.categories).toEqual([]);

    const product = await createCoupon({
      code: 'TSHIRT15',
      discountType: 'PERCENTAGE',
      discountValue: 15,
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
      ...dates(),
    });
    expect(product.status).toBe(HTTP_STATUS.CREATED);
    expect(product.body.data.products).toHaveLength(1);
    expect(product.body.data.products[0].id).toBe(tshirtProductId);

    const category = await createCoupon({
      code: 'MEN20',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      scope: 'CATEGORY',
      categoryIds: [menCategoryId],
      ...dates(),
    });
    expect(category.status).toBe(HTTP_STATUS.CREATED);
    expect(category.body.data.categories[0].id).toBe(menCategoryId);

    const fixed = await createCoupon({
      code: 'FLAT500',
      discountType: 'FIXED_AMOUNT',
      discountValue: '500.00',
      scope: 'CART',
      ...dates(),
    });
    expect(fixed.status).toBe(HTTP_STATUS.CREATED);
    expect(fixed.body.data.discountType).toBe('FIXED_AMOUNT');
    expect(fixed.body.data.discountValue).toBe('500.00');
  });

  it('17. Product coupon with multiple valid products', async () => {
    const res = await createCoupon({
      code: 'MULTI15',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'PRODUCT',
      productIds: [tshirtProductId, jeansProductId],
      ...dates(),
    });
    expect(res.status).toBe(HTTP_STATUS.CREATED);
    expect(res.body.data.products).toHaveLength(2);
  });

  it('18. Invalid product ID is rejected and no coupon is created', async () => {
    const res = await createCoupon({
      code: 'BADPROD',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'PRODUCT',
      productIds: ['00000000-0000-0000-0000-000000000001'],
      ...dates(),
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(await prisma.coupon.count({ where: { code: 'BADPROD' } })).toBe(0);
  });

  it('19. Duplicate product IDs in the request are rejected', async () => {
    const res = await createCoupon({
      code: 'DUPPROD',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'PRODUCT',
      productIds: [tshirtProductId, tshirtProductId],
      ...dates(),
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('20. PRODUCT coupon without productIds is rejected', async () => {
    const res = await createCoupon({
      code: 'NOPROD',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'PRODUCT',
      ...dates(),
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('21. Category coupon with valid categories', async () => {
    const res = await createCoupon({
      code: 'APPAREL10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CATEGORY',
      categoryIds: [menCategoryId, womenCategoryId],
      ...dates(),
    });
    expect(res.status).toBe(HTTP_STATUS.CREATED);
    expect(res.body.data.categories).toHaveLength(2);
  });

  it('22. Invalid category ID is rejected', async () => {
    const res = await createCoupon({
      code: 'BADCAT',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CATEGORY',
      categoryIds: ['00000000-0000-0000-0000-000000000001'],
      ...dates(),
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(await prisma.coupon.count({ where: { code: 'BADCAT' } })).toBe(0);
  });

  it('23. Duplicate category IDs in the request are rejected', async () => {
    const res = await createCoupon({
      code: 'DUPCAT',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CATEGORY',
      categoryIds: [menCategoryId, menCategoryId],
      ...dates(),
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('24. CATEGORY coupon without categoryIds is rejected', async () => {
    const res = await createCoupon({
      code: 'NOCAT',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CATEGORY',
      ...dates(),
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('CART coupon rejects productIds', async () => {
    const res = await createCoupon({
      code: 'CARTBAD',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CART',
      productIds: [tshirtProductId],
      ...dates(),
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });
});

describe('Admin Coupons — Validation', () => {
  it('25-26. Duplicate codes are rejected, including case-insensitive duplicates', async () => {
    const first = await createCoupon({
      code: 'SAVE20',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      scope: 'CART',
      ...dates(),
    });
    expect(first.status).toBe(HTTP_STATUS.CREATED);

    const second = await createCoupon({
      code: 'save20',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CART',
      ...dates(),
    });
    expect(second.status).toBe(HTTP_STATUS.CONFLICT);
  });

  it('27. Invalid discount is rejected', async () => {
    const negative = await createCoupon({
      code: 'NEG',
      discountType: 'PERCENTAGE',
      discountValue: -10,
      scope: 'CART',
      ...dates(),
    });
    expect(negative.status).toBe(HTTP_STATUS.UNPROCESSABLE);

    const over = await createCoupon({
      code: 'OVER',
      discountType: 'PERCENTAGE',
      discountValue: 150,
      scope: 'CART',
      ...dates(),
    });
    expect(over.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('28. Invalid dates are rejected', async () => {
    const res = await createCoupon({
      code: 'DATES',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CART',
      startsAt: new Date(Date.now() + hour).toISOString(),
      expiresAt: new Date(Date.now() - hour).toISOString(),
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('29. Invalid scope is rejected', async () => {
    const res = await createCoupon({
      code: 'SCOPE',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'ITEM',
      ...dates(),
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('30. Invalid usage limits are rejected', async () => {
    const zero = await createCoupon({
      code: 'ZERO',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CART',
      usageLimit: 0,
      ...dates(),
    });
    expect(zero.status).toBe(HTTP_STATUS.UNPROCESSABLE);

    const negative = await createCoupon({
      code: 'NEGUSE',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CART',
      perUserLimit: -1,
      ...dates(),
    });
    expect(negative.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });
});

describe('Admin Coupons — Read', () => {
  it('31-38. List, search, filter, paginate, and return details with mappings and usage count', async () => {
    await createCoupon({
      code: 'SAVE20',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      scope: 'CART',
      status: 'ACTIVE',
      ...dates(),
    });
    await createCoupon({
      code: 'FLAT500',
      discountType: 'FIXED_AMOUNT',
      discountValue: 500,
      scope: 'CART',
      status: 'INACTIVE',
      ...dates(),
    });
    const productCoupon = await createCoupon({
      code: 'TSHIRT15',
      discountType: 'PERCENTAGE',
      discountValue: 15,
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
      ...dates(),
    });
    await createCoupon({
      code: 'FUTURE10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CART',
      ...dates(24 * hour, 48 * hour),
    });

    const list = await listCoupons();
    expect(list.status).toBe(HTTP_STATUS.OK);
    expect(list.body.data).toHaveLength(4);
    expect(list.body.pagination).toMatchObject({ page: 1, total: 4 });
    expect(list.body.data[0].usageCount).toBe(0);

    const search = await listCoupons({ search: 'SAVE' });
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].code).toBe('SAVE20');

    const filtered = await listCoupons({ status: 'INACTIVE', discountType: 'FIXED_AMOUNT' });
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].code).toBe('FLAT500');

    const upcoming = await listCoupons({ validity: 'UPCOMING' });
    expect(upcoming.body.data.some((c: { code: string }) => c.code === 'FUTURE10')).toBe(true);

    const page1 = await listCoupons({ page: '1', limit: '2' });
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.pagination.totalPages).toBe(2);

    const page2 = await listCoupons({ page: '2', limit: '2' });
    expect(page2.body.data).toHaveLength(2);

    const detail = await request(app)
      .get(`/api/v1/admin/coupons/${productCoupon.body.data.id}`)
      .set(authHeader(adminToken));
    expect(detail.status).toBe(HTTP_STATUS.OK);
    expect(detail.body.data.products).toHaveLength(1);
    expect(detail.body.data.products[0]).toMatchObject({
      id: tshirtProductId,
      name: 'Premium T-Shirt',
      slug: 'premium-t-shirt',
    });
    expect(detail.body.data.usageCount).toBe(0);

    const categoryCoupon = await createCoupon({
      code: 'MEN20',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      scope: 'CATEGORY',
      categoryIds: [menCategoryId],
      ...dates(),
    });
    const categoryDetail = await request(app)
      .get(`/api/v1/admin/coupons/${categoryCoupon.body.data.id}`)
      .set(authHeader(adminToken));
    expect(categoryDetail.body.data.categories[0].id).toBe(menCategoryId);
  });

  it('returns 404 for an unknown coupon', async () => {
    const res = await request(app)
      .get('/api/v1/admin/coupons/00000000-0000-0000-0000-000000000001')
      .set(authHeader(adminToken));
    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
  });
});

describe('Admin Coupons — Update', () => {
  it('39-43. Updates config, replaces mappings, changes scope, and removes stale mappings', async () => {
    const created = await createCoupon({
      code: 'TSHIRT15',
      discountType: 'PERCENTAGE',
      discountValue: 15,
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
      ...dates(),
    });
    const couponId = created.body.data.id;

    const updated = await request(app)
      .patch(`/api/v1/admin/coupons/${couponId}`)
      .set(authHeader(adminToken))
      .send({
        maximumDiscount: 200,
        productIds: [jeansProductId],
      });
    expect(updated.status).toBe(HTTP_STATUS.OK);
    expect(updated.body.data.maximumDiscount).toBe('200.00');
    expect(updated.body.data.products).toHaveLength(1);
    expect(updated.body.data.products[0].id).toBe(jeansProductId);

    const scoped = await request(app)
      .patch(`/api/v1/admin/coupons/${couponId}`)
      .set(authHeader(adminToken))
      .send({
        scope: 'CATEGORY',
        categoryIds: [menCategoryId],
      });
    expect(scoped.status).toBe(HTTP_STATUS.OK);
    expect(scoped.body.data.scope).toBe('CATEGORY');
    expect(scoped.body.data.products).toEqual([]);
    expect(scoped.body.data.categories).toHaveLength(1);

    const cart = await request(app)
      .patch(`/api/v1/admin/coupons/${couponId}`)
      .set(authHeader(adminToken))
      .send({ scope: 'CART' });
    expect(cart.status).toBe(HTTP_STATUS.OK);
    expect(cart.body.data.scope).toBe('CART');
    expect(cart.body.data.products).toEqual([]);
    expect(cart.body.data.categories).toEqual([]);
  });

  it('44. Immutable fields are rejected after usage', async () => {
    const created = await createCoupon({
      code: 'SAVE20',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      scope: 'CART',
      ...dates(),
    });
    const couponId = created.body.data.id;

    await prisma.couponUsage.create({
      data: {
        couponId,
        userId: customerId,
        orderId: null,
        discountAmount: '100.00',
      },
    });

    const codeChange = await request(app)
      .patch(`/api/v1/admin/coupons/${couponId}`)
      .set(authHeader(adminToken))
      .send({ code: 'NEWCODE' });
    expect(codeChange.status).toBe(HTTP_STATUS.UNPROCESSABLE);

    const typeChange = await request(app)
      .patch(`/api/v1/admin/coupons/${couponId}`)
      .set(authHeader(adminToken))
      .send({ discountType: 'FIXED_AMOUNT', discountValue: 100 });
    expect(typeChange.status).toBe(HTTP_STATUS.UNPROCESSABLE);

    const mutable = await request(app)
      .patch(`/api/v1/admin/coupons/${couponId}`)
      .set(authHeader(adminToken))
      .send({ minimumCartValue: 5000, usageLimit: 50 });
    expect(mutable.status).toBe(HTTP_STATUS.OK);
    expect(mutable.body.data.minimumCartValue).toBe('5000.00');
    expect(mutable.body.data.usageLimit).toBe(50);
    expect(mutable.body.data.code).toBe('SAVE20');
    expect(mutable.body.data.usageCount).toBe(1);
  });

  it('scope change to PRODUCT requires productIds', async () => {
    const created = await createCoupon({
      code: 'CART10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CART',
      ...dates(),
    });
    const res = await request(app)
      .patch(`/api/v1/admin/coupons/${created.body.data.id}`)
      .set(authHeader(adminToken))
      .send({ scope: 'PRODUCT' });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });
});

describe('Admin Coupons — Status and archive', () => {
  it('45-47. Activate, deactivate, and reject invalid activation', async () => {
    const created = await createCoupon({
      code: 'SAVE20',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      scope: 'CART',
      status: 'INACTIVE',
      ...dates(),
    });
    const couponId = created.body.data.id;

    const activated = await request(app)
      .patch(`/api/v1/admin/coupons/${couponId}/activate`)
      .set(authHeader(adminToken));
    expect(activated.status).toBe(HTTP_STATUS.OK);
    expect(activated.body.data.status).toBe('ACTIVE');

    const deactivated = await request(app)
      .patch(`/api/v1/admin/coupons/${couponId}/deactivate`)
      .set(authHeader(adminToken));
    expect(deactivated.status).toBe(HTTP_STATUS.OK);
    expect(deactivated.body.data.status).toBe('INACTIVE');
  });

  it('47. PRODUCT coupon with no remaining mappings cannot be activated', async () => {
    const created = await createCoupon({
      code: 'TSHIRT15',
      discountType: 'PERCENTAGE',
      discountValue: 15,
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
      status: 'INACTIVE',
      ...dates(),
    });

    await prisma.couponProduct.deleteMany({ where: { couponId: created.body.data.id } });

    const res = await request(app)
      .patch(`/api/v1/admin/coupons/${created.body.data.id}/activate`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('48-49. DELETE archives by deactivating and preserves usage history', async () => {
    const created = await createCoupon({
      code: 'SAVE20',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      scope: 'CART',
      ...dates(),
    });
    const couponId = created.body.data.id;
    await prisma.couponUsage.create({
      data: {
        couponId,
        userId: customerId,
        orderId: null,
        discountAmount: '80.00',
      },
    });

    const archived = await request(app)
      .delete(`/api/v1/admin/coupons/${couponId}`)
      .set(authHeader(adminToken));
    expect(archived.status).toBe(HTTP_STATUS.OK);
    expect(archived.body.data.status).toBe('INACTIVE');

    expect(await prisma.coupon.count({ where: { id: couponId } })).toBe(1);
    expect(await prisma.couponUsage.count({ where: { couponId } })).toBe(1);

    const usages = await request(app)
      .get(`/api/v1/admin/coupons/${couponId}/usages`)
      .set(authHeader(adminToken));
    expect(usages.status).toBe(HTTP_STATUS.OK);
    expect(usages.body.data).toHaveLength(1);
    expect(usages.body.data[0].discountAmount).toBeDefined();
    expect(usages.body.data[0].mobileNumber).toBeUndefined();
  });
});

describe('Admin Coupons — Customer integration', () => {
  it('50-53. Customer CouponService sees admin-created, updated, and deactivated coupons', async () => {
    const created = await createCoupon({
      code: 'WELCOME10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CART',
      ...dates(),
    });
    expect(created.status).toBe(HTTP_STATUS.CREATED);

    await request(app)
      .post('/api/v1/cart/items')
      .set(authHeader(customerToken))
      .send({ variantId: tshirtVariantId, quantity: 1 });

    const applied = await request(app)
      .post('/api/v1/cart/coupon')
      .set(authHeader(customerToken))
      .send({ code: 'welcome10' });
    expect(applied.status).toBe(HTTP_STATUS.OK);
    expect(applied.body.data.coupon.code).toBe('WELCOME10');
    expect(applied.body.data.discountAmount).toBe('100.00');

    const updated = await request(app)
      .patch(`/api/v1/admin/coupons/${created.body.data.id}`)
      .set(authHeader(adminToken))
      .send({ discountValue: 20 });
    expect(updated.status).toBe(HTTP_STATUS.OK);

    const reapplied = await request(app)
      .post('/api/v1/cart/coupon')
      .set(authHeader(customerToken))
      .send({ code: 'WELCOME10' });
    expect(reapplied.status).toBe(HTTP_STATUS.OK);
    expect(reapplied.body.data.discountAmount).toBe('200.00');

    await request(app)
      .patch(`/api/v1/admin/coupons/${created.body.data.id}/deactivate`)
      .set(authHeader(adminToken));

    const afterDeactivate = await request(app)
      .post('/api/v1/cart/coupon')
      .set(authHeader(customerToken))
      .send({ code: 'WELCOME10' });
    expect(afterDeactivate.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(afterDeactivate.body.message).toMatch(/no longer active/i);
  });
});

describe('Admin Coupons — Security', () => {
  it('54. Unknown coupon IDs return 404 and extra body fields cannot create a coupon for another resource', async () => {
    const missing = await request(app)
      .patch('/api/v1/admin/coupons/00000000-0000-0000-0000-000000000001')
      .set(authHeader(adminToken))
      .send({ status: 'INACTIVE' });
    expect(missing.status).toBe(HTTP_STATUS.NOT_FOUND);

    const extra = await createCoupon({
      code: 'SAFE10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      scope: 'CART',
      userId: customerId,
      ...dates(),
    });
    expect(extra.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('55. Customer cart coupon endpoints cannot create or mutate coupon configuration', async () => {
    await request(app)
      .post('/api/v1/cart/items')
      .set(authHeader(customerToken))
      .send({ variantId: tshirtVariantId, quantity: 1 });

    const res = await request(app)
      .post('/api/v1/cart/coupon')
      .set(authHeader(customerToken))
      .send({
        code: 'HACK20',
        discountType: 'PERCENTAGE',
        discountValue: 90,
        scope: 'CART',
      });
    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(await prisma.coupon.count({ where: { code: 'HACK20' } })).toBe(0);
  });
});
