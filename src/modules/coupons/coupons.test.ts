/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { appConfig } from '../../config/index.js';
import * as s3Service from '../../shared/services/s3.js';
import * as couponService from './service.js';

vi.mock('../../shared/services/s3.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/services/s3.js')>();

  return {
    ...actual,
    createPresignedUploadUrl: vi.fn(),
    assertObjectExists: vi.fn(),
    deleteObjectIfExists: vi.fn(),
    buildPublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
  };
});

const app = createApp();

let customerId: string;
let otherCustomerId: string;
let customerToken: string;
let otherCustomerToken: string;

let menCategoryId: string;
let womenCategoryId: string;
let colorValueId: string;
let sizeValueId: string;

let tshirtProductId: string;
let tshirtVariantBlack: string;
let tshirtVariantWhite: string;
let jeansVariantId: string;
let dressVariantId: string;

const hour = 60 * 60 * 1000;

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

async function seedVariant(opts: {
  sku: string;
  productName: string;
  productSlug: string;
  price: string;
  categoryId: string;
  quantity?: number;
}): Promise<{ productId: string; variantId: string }> {
  const existing = await prisma.product.findUnique({
    where: { slug: opts.productSlug },
    select: { id: true },
  });

  if (existing) {
    const variant = await prisma.productVariant.create({
      data: {
        productId: existing.id,
        sku: opts.sku,
        price: opts.price,
        status: 'ACTIVE',
        attributes: {
          create: [{ attributeValueId: colorValueId }, { attributeValueId: sizeValueId }],
        },
        inventory: { create: { quantity: opts.quantity ?? 10, reservedQuantity: 0 } },
      },
      select: { id: true },
    });
    return { productId: existing.id, variantId: variant.id };
  }

  const product = await prisma.product.create({
    data: {
      name: opts.productName,
      slug: opts.productSlug,
      basePrice: opts.price,
      status: 'ACTIVE',
      categoryId: opts.categoryId,
      variants: {
        create: {
          sku: opts.sku,
          price: opts.price,
          status: 'ACTIVE',
          attributes: {
            create: [{ attributeValueId: colorValueId }, { attributeValueId: sizeValueId }],
          },
          inventory: { create: { quantity: opts.quantity ?? 10, reservedQuantity: 0 } },
        },
      },
    },
    select: { id: true, variants: { select: { id: true } } },
  });

  return { productId: product.id, variantId: product.variants[0]!.id };
}

type CouponSeed = {
  code: string;
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue?: string;
  scope?: 'CART' | 'PRODUCT' | 'CATEGORY';
  status?: 'ACTIVE' | 'INACTIVE';
  minimumCartValue?: string | null;
  maximumDiscount?: string | null;
  startsAt?: Date;
  expiresAt?: Date;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  productIds?: string[];
  categoryIds?: string[];
};

async function createCoupon(seed: CouponSeed) {
  const now = Date.now();
  return prisma.coupon.create({
    data: {
      code: seed.code,
      discountType: seed.discountType ?? 'PERCENTAGE',
      discountValue: seed.discountValue ?? '10.00',
      scope: seed.scope ?? 'CART',
      status: seed.status ?? 'ACTIVE',
      minimumCartValue: seed.minimumCartValue ?? null,
      maximumDiscount: seed.maximumDiscount ?? null,
      startsAt: seed.startsAt ?? new Date(now - hour),
      expiresAt: seed.expiresAt ?? new Date(now + 24 * hour),
      usageLimit: seed.usageLimit ?? null,
      perUserLimit: seed.perUserLimit ?? null,
      products: seed.productIds
        ? { create: seed.productIds.map((productId) => ({ productId })) }
        : undefined,
      categories: seed.categoryIds
        ? { create: seed.categoryIds.map((categoryId) => ({ categoryId })) }
        : undefined,
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();

  vi.mocked(s3Service.buildPublicUrl).mockImplementation(
    (key: string) => `https://cdn.example.com/${key}`,
  );

  const customerRole = await prisma.role.create({ data: { name: 'customer' } });

  const customerUser = await prisma.user.create({
    data: { name: 'Customer One', mobileNumber: '8888888881', roleId: customerRole.id },
  });
  const otherUser = await prisma.user.create({
    data: { name: 'Customer Two', mobileNumber: '7777777771', roleId: customerRole.id },
  });

  customerId = customerUser.id;
  otherCustomerId = otherUser.id;
  customerToken = jwt.sign({ id: customerUser.id }, appConfig.jwtSecret);
  otherCustomerToken = jwt.sign({ id: otherUser.id }, appConfig.jwtSecret);

  const men = await prisma.category.create({ data: { name: 'Men', slug: 'men' } });
  const women = await prisma.category.create({ data: { name: 'Women', slug: 'women' } });
  menCategoryId = men.id;
  womenCategoryId = women.id;

  const color = await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });
  const size = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
  const colorBlack = await prisma.attributeValue.create({
    data: { attributeId: color.id, value: 'Black', slug: 'black', colorCode: '#000000' },
  });
  const sizeM = await prisma.attributeValue.create({
    data: { attributeId: size.id, value: 'M', slug: 'm' },
  });
  colorValueId = colorBlack.id;
  sizeValueId = sizeM.id;

  const tshirtBlack = await seedVariant({
    sku: 'CPN-TSH-BLK-M',
    productName: 'Premium T-Shirt',
    productSlug: 'premium-t-shirt',
    price: '1000.00',
    categoryId: menCategoryId,
  });
  tshirtProductId = tshirtBlack.productId;
  tshirtVariantBlack = tshirtBlack.variantId;

  const tshirtWhite = await seedVariant({
    sku: 'CPN-TSH-WHT-M',
    productName: 'Premium T-Shirt',
    productSlug: 'premium-t-shirt',
    price: '1000.00',
    categoryId: menCategoryId,
  });
  tshirtVariantWhite = tshirtWhite.variantId;

  const jeans = await seedVariant({
    sku: 'CPN-JNS-BLK-M',
    productName: 'Straight Jeans',
    productSlug: 'straight-jeans',
    price: '2000.00',
    categoryId: menCategoryId,
  });
  jeansVariantId = jeans.variantId;

  const dress = await seedVariant({
    sku: 'CPN-DRS-PNK-M',
    productName: 'Wrap Dress',
    productSlug: 'wrap-dress',
    price: '3000.00',
    categoryId: womenCategoryId,
  });
  dressVariantId = dress.variantId;
});

afterAll(async () => {
  await cleanDatabase();
});

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function addToCart(token: string, variantId: string, quantity: number) {
  return request(app)
    .post('/api/v1/cart/items')
    .set(authHeader(token))
    .send({ variantId, quantity });
}

async function getCart(token: string) {
  return request(app).get('/api/v1/cart').set(authHeader(token));
}

async function updateCartItem(token: string, cartItemId: string, quantity: number) {
  return request(app)
    .patch(`/api/v1/cart/items/${cartItemId}`)
    .set(authHeader(token))
    .send({ quantity });
}

async function removeCartItem(token: string, cartItemId: string) {
  return request(app).delete(`/api/v1/cart/items/${cartItemId}`).set(authHeader(token));
}

async function applyCoupon(token: string, code: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/v1/cart/coupon')
    .set(authHeader(token))
    .send({ code, ...extra });
}

async function removeCoupon(token: string) {
  return request(app).delete('/api/v1/cart/coupon').set(authHeader(token));
}

async function fillCartTshirt(token: string = customerToken) {
  return addToCart(token, tshirtVariantBlack, 1);
}

// ---------------------------------------------------------------------------
// Authentication / request validation
// ---------------------------------------------------------------------------

describe('Coupons — Authentication and request validation', () => {
  it('1. Unauthenticated user cannot apply a coupon', async () => {
    const res = await request(app).post('/api/v1/cart/coupon').send({ code: 'SAVE20' });
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('1b. Unauthenticated user cannot remove a coupon', async () => {
    const res = await request(app).delete('/api/v1/cart/coupon');
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('12. Empty coupon code is rejected', async () => {
    await fillCartTshirt();
    const res = await applyCoupon(customerToken, '   ');
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('12b. Missing coupon code is rejected', async () => {
    await fillCartTshirt();
    const res = await request(app)
      .post('/api/v1/cart/coupon')
      .set(authHeader(customerToken))
      .send({});
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('2. Empty cart cannot receive a coupon', async () => {
    await createCoupon({ code: 'SAVE20' });
    const res = await applyCoupon(customerToken, 'SAVE20');
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.message).toMatch(/empty cart/i);
  });
});

// ---------------------------------------------------------------------------
// Basic validity
// ---------------------------------------------------------------------------

describe('Coupons — Basic validity', () => {
  it('1. Valid cart coupon is applied', async () => {
    await createCoupon({ code: 'SAVE20', discountType: 'PERCENTAGE', discountValue: '20.00' });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);

    const res = await applyCoupon(customerToken, 'save20');

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('3000.00');
    expect(res.body.data.discountAmount).toBe('600.00');
    expect(res.body.data.finalSubtotal).toBe('2400.00');
    expect(res.body.data.coupon.code).toBe('SAVE20');
    expect(res.body.data.coupon.scope).toBe('CART');
  });

  it('2. Unknown coupon is not found', async () => {
    await fillCartTshirt();
    const res = await applyCoupon(customerToken, 'DOESNOTEXIST');
    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(res.body.success).toBe(false);
  });

  it('3. Inactive coupon is rejected', async () => {
    await createCoupon({ code: 'INACTIVE10', status: 'INACTIVE' });
    await fillCartTshirt();
    const res = await applyCoupon(customerToken, 'INACTIVE10');
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.message).toMatch(/no longer active/i);
  });

  it('4. Future coupon is rejected', async () => {
    await createCoupon({
      code: 'FUTURE10',
      startsAt: new Date(Date.now() + 24 * hour),
      expiresAt: new Date(Date.now() + 48 * hour),
    });
    await fillCartTshirt();
    const res = await applyCoupon(customerToken, 'FUTURE10');
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.message).toMatch(/not yet valid/i);
  });

  it('5. Expired coupon is rejected', async () => {
    await createCoupon({
      code: 'EXPIRED10',
      startsAt: new Date(Date.now() - 48 * hour),
      expiresAt: new Date(Date.now() - hour),
    });
    await fillCartTshirt();
    const res = await applyCoupon(customerToken, 'EXPIRED10');
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.message).toMatch(/expired/i);
  });
});

// ---------------------------------------------------------------------------
// Percentage and fixed discounts
// ---------------------------------------------------------------------------

describe('Coupons — Percentage and fixed discounts', () => {
  it('6. 10% discount on the cart', async () => {
    await createCoupon({ code: 'TENOFF', discountValue: '10.00' });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);

    const res = await applyCoupon(customerToken, 'TENOFF');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.discountAmount).toBe('300.00');
    expect(res.body.data.finalSubtotal).toBe('2700.00');
  });

  it('7. 20% discount on the cart', async () => {
    await createCoupon({ code: 'TWENTY', discountValue: '20.00' });
    await addToCart(customerToken, tshirtVariantBlack, 3);

    const res = await applyCoupon(customerToken, 'TWENTY');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('3000.00');
    expect(res.body.data.discountAmount).toBe('600.00');
  });

  it('8. Maximum discount cap is applied', async () => {
    await createCoupon({
      code: 'SAVE20',
      discountValue: '20.00',
      maximumDiscount: '500.00',
    });
    await addToCart(customerToken, tshirtVariantBlack, 5);

    const res = await applyCoupon(customerToken, 'SAVE20');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('5000.00');
    expect(res.body.data.discountAmount).toBe('500.00');
    expect(res.body.data.finalSubtotal).toBe('4500.00');
  });

  it('9. Percentage discount does not exceed the subtotal', async () => {
    await createCoupon({ code: 'HUNDRED', discountValue: '100.00' });
    await fillCartTshirt();

    const res = await applyCoupon(customerToken, 'HUNDRED');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.discountAmount).toBe('1000.00');
    expect(res.body.data.finalSubtotal).toBe('0.00');
  });

  it('10. ₹500 fixed discount', async () => {
    await createCoupon({
      code: 'FLAT500',
      discountType: 'FIXED_AMOUNT',
      discountValue: '500.00',
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);

    const res = await applyCoupon(customerToken, 'FLAT500');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.discountAmount).toBe('500.00');
    expect(res.body.data.finalSubtotal).toBe('2500.00');
  });

  it('11. Fixed discount greater than subtotal is capped', async () => {
    await createCoupon({
      code: 'FLAT500',
      discountType: 'FIXED_AMOUNT',
      discountValue: '500.00',
    });
    await fillCartTshirt();

    const res = await applyCoupon(customerToken, 'FLAT500');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('1000.00');
    expect(res.body.data.discountAmount).toBe('500.00');
  });

  it('11b. Fixed discount greater than a small eligible subtotal is capped to that subtotal', async () => {
    await createCoupon({
      code: 'FLAT500',
      discountType: 'FIXED_AMOUNT',
      discountValue: '500.00',
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);

    await prisma.productVariant.update({
      where: { id: tshirtVariantBlack },
      data: { price: '300.00' },
    });

    const res = await applyCoupon(customerToken, 'FLAT500');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.discountAmount).toBe('300.00');
    expect(res.body.data.finalSubtotal).toBe('0.00');
  });

  it('12. Fixed discount equal to subtotal yields zero final subtotal', async () => {
    await createCoupon({
      code: 'FLAT1000',
      discountType: 'FIXED_AMOUNT',
      discountValue: '1000.00',
    });
    await fillCartTshirt();

    const res = await applyCoupon(customerToken, 'FLAT1000');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.discountAmount).toBe('1000.00');
    expect(res.body.data.finalSubtotal).toBe('0.00');
  });
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

describe('Coupons — Scope', () => {
  it('13. Cart-wide coupon discounts the full available subtotal', async () => {
    await createCoupon({ code: 'CART10', discountValue: '10.00', scope: 'CART' });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);
    await addToCart(customerToken, dressVariantId, 1);

    const res = await applyCoupon(customerToken, 'CART10');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('6000.00');
    expect(res.body.data.coupon.eligibleSubtotal).toBe('6000.00');
    expect(res.body.data.discountAmount).toBe('600.00');
  });

  it('14. Product-specific coupon applies to every variant of that product', async () => {
    await createCoupon({
      code: 'TSHIRT15',
      discountValue: '15.00',
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, tshirtVariantWhite, 1);

    const res = await applyCoupon(customerToken, 'TSHIRT15');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('2000.00');
    expect(res.body.data.coupon.eligibleSubtotal).toBe('2000.00');
    expect(res.body.data.discountAmount).toBe('300.00');
    expect(res.body.data.coupon.eligibleItemIds).toHaveLength(2);
  });

  it('15. Product coupon with multiple eligible products', async () => {
    const jeansProduct = await prisma.productVariant.findUnique({
      where: { id: jeansVariantId },
      select: { productId: true },
    });
    await createCoupon({
      code: 'MULTI15',
      discountValue: '10.00',
      scope: 'PRODUCT',
      productIds: [tshirtProductId, jeansProduct!.productId],
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);
    await addToCart(customerToken, dressVariantId, 1);

    const res = await applyCoupon(customerToken, 'MULTI15');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.coupon.eligibleSubtotal).toBe('3000.00');
    expect(res.body.data.discountAmount).toBe('300.00');
    expect(res.body.data.finalSubtotal).toBe('5700.00');
  });

  it('16. Category-specific coupon', async () => {
    await createCoupon({
      code: 'MEN20',
      discountValue: '20.00',
      scope: 'CATEGORY',
      categoryIds: [menCategoryId],
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);

    const res = await applyCoupon(customerToken, 'MEN20');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.coupon.eligibleSubtotal).toBe('3000.00');
    expect(res.body.data.discountAmount).toBe('600.00');
  });

  it('17. Category coupon with multiple eligible categories', async () => {
    await createCoupon({
      code: 'APPAREL10',
      discountValue: '10.00',
      scope: 'CATEGORY',
      categoryIds: [menCategoryId, womenCategoryId],
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, dressVariantId, 1);

    const res = await applyCoupon(customerToken, 'APPAREL10');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.coupon.eligibleSubtotal).toBe('4000.00');
    expect(res.body.data.discountAmount).toBe('400.00');
  });

  it('18. Ineligible products receive no discount', async () => {
    await createCoupon({
      code: 'TSHIRT20',
      discountValue: '20.00',
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
    });
    await addToCart(customerToken, jeansVariantId, 1);

    const res = await applyCoupon(customerToken, 'TSHIRT20');
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.message).toMatch(/does not apply/i);
  });

  it('19. Mixed eligible/ineligible cart discounts only eligible items', async () => {
    await createCoupon({
      code: 'TSHIRT20',
      discountValue: '20.00',
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);
    await addToCart(customerToken, dressVariantId, 1);

    const res = await applyCoupon(customerToken, 'TSHIRT20');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('6000.00');
    expect(res.body.data.coupon.eligibleSubtotal).toBe('1000.00');
    expect(res.body.data.discountAmount).toBe('200.00');
    expect(res.body.data.finalSubtotal).toBe('5800.00');
    expect(res.body.data.coupon.eligibleItemIds).toHaveLength(1);
    expect(res.body.data.coupon.ineligibleItemIds).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Minimum order — uses FULL cart subtotal
// ---------------------------------------------------------------------------

describe('Coupons — Minimum cart value (full cart subtotal)', () => {
  it('20. Below minimum value is rejected', async () => {
    await createCoupon({
      code: 'MIN30',
      discountValue: '10.00',
      minimumCartValue: '3000.00',
    });
    await fillCartTshirt();

    const res = await applyCoupon(customerToken, 'MIN30');
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.message).toMatch(/minimum order value/i);
  });

  it('21. Exactly minimum value is accepted', async () => {
    await createCoupon({
      code: 'MIN30',
      discountValue: '10.00',
      minimumCartValue: '3000.00',
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);

    const res = await applyCoupon(customerToken, 'MIN30');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('3000.00');
    expect(res.body.data.discountAmount).toBe('300.00');
  });

  it('22. Above minimum value is accepted', async () => {
    await createCoupon({
      code: 'MIN30',
      discountValue: '10.00',
      minimumCartValue: '3000.00',
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);
    await addToCart(customerToken, dressVariantId, 1);

    const res = await applyCoupon(customerToken, 'MIN30');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('6000.00');
  });

  it('22b. Minimum uses full cart subtotal even when discount is only on eligible items', async () => {
    await createCoupon({
      code: 'TSHIRT20',
      discountValue: '20.00',
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
      minimumCartValue: '3000.00',
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);

    const res = await applyCoupon(customerToken, 'TSHIRT20');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('3000.00');
    expect(res.body.data.coupon.eligibleSubtotal).toBe('1000.00');
    expect(res.body.data.discountAmount).toBe('200.00');
  });
});

// ---------------------------------------------------------------------------
// Usage limits — apply does NOT consume usage
// ---------------------------------------------------------------------------

describe('Coupons — Usage limits', () => {
  it('23. Total usage limit blocks apply once the recorded usages are exhausted', async () => {
    const coupon = await createCoupon({
      code: 'ONCE',
      discountValue: '10.00',
      usageLimit: 1,
    });
    await prisma.couponUsage.create({
      data: {
        couponId: coupon.id,
        userId: otherCustomerId,
        orderId: null,
        discountAmount: '100.00',
      },
    });
    await fillCartTshirt();

    const res = await applyCoupon(customerToken, 'ONCE');
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.message).toMatch(/usage limit/i);
  });

  it('24. Per-user usage limit blocks the same user', async () => {
    const coupon = await createCoupon({
      code: 'ONCEUSER',
      discountValue: '10.00',
      perUserLimit: 1,
    });
    await prisma.couponUsage.create({
      data: {
        couponId: coupon.id,
        userId: customerId,
        orderId: null,
        discountAmount: '100.00',
      },
    });
    await fillCartTshirt();

    const res = await applyCoupon(customerToken, 'ONCEUSER');
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.message).toMatch(/maximum number of times/i);
  });

  it('25. Different users can use a per-user-limited coupon independently', async () => {
    const coupon = await createCoupon({
      code: 'ONCEUSER',
      discountValue: '10.00',
      perUserLimit: 1,
    });
    await prisma.couponUsage.create({
      data: {
        couponId: coupon.id,
        userId: otherCustomerId,
        orderId: null,
        discountAmount: '100.00',
      },
    });
    await fillCartTshirt();

    const res = await applyCoupon(customerToken, 'ONCEUSER');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.coupon.code).toBe('ONCEUSER');
  });

  it('26. Null usage limits are treated as unlimited', async () => {
    await createCoupon({
      code: 'UNLIMITED',
      discountValue: '10.00',
      usageLimit: null,
      perUserLimit: null,
    });
    await fillCartTshirt();

    const first = await applyCoupon(customerToken, 'UNLIMITED');
    expect(first.status).toBe(HTTP_STATUS.OK);

    const second = await applyCoupon(customerToken, 'UNLIMITED');
    expect(second.status).toBe(HTTP_STATUS.OK);
  });

  it('26b. Applying a coupon does not create a CouponUsage row', async () => {
    const coupon = await createCoupon({ code: 'SAVE10', discountValue: '10.00' });
    await fillCartTshirt();
    await applyCoupon(customerToken, 'SAVE10');

    const usageCount = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
    expect(usageCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cart mutations revalidate the stored coupon
// ---------------------------------------------------------------------------

describe('Coupons — Cart mutations revalidate the coupon', () => {
  it('27. Removing the last eligible item clears the coupon', async () => {
    await createCoupon({
      code: 'TSHIRT20',
      discountValue: '20.00',
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);
    const applied = await applyCoupon(customerToken, 'TSHIRT20');
    expect(applied.body.data.coupon).not.toBeNull();

    const tshirtItem = applied.body.data.items.find(
      (item: { variantId: string }) => item.variantId === tshirtVariantBlack,
    );
    const res = await removeCartItem(customerToken, tshirtItem.id);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.coupon).toBeNull();
    expect(res.body.data.discountAmount).toBe('0.00');
    expect(res.body.data.finalSubtotal).toBe(res.body.data.subtotal);
  });

  it('28. Adding an eligible item increases the discount', async () => {
    await createCoupon({ code: 'CART10', discountValue: '10.00', scope: 'CART' });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await applyCoupon(customerToken, 'CART10');

    const res = await addToCart(customerToken, jeansVariantId, 1);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('3000.00');
    expect(res.body.data.discountAmount).toBe('300.00');
    expect(res.body.data.coupon.code).toBe('CART10');
  });

  it('29. Changing quantity recalculates the discount', async () => {
    await createCoupon({ code: 'CART10', discountValue: '10.00', scope: 'CART' });
    const added = await addToCart(customerToken, tshirtVariantBlack, 1);
    await applyCoupon(customerToken, 'CART10');

    const res = await updateCartItem(customerToken, added.body.data.items[0].id, 3);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('3000.00');
    expect(res.body.data.discountAmount).toBe('300.00');
  });

  it('30. GET cart recalculates against current authoritative prices', async () => {
    await createCoupon({ code: 'CART10', discountValue: '10.00', scope: 'CART' });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await applyCoupon(customerToken, 'CART10');

    await prisma.productVariant.update({
      where: { id: tshirtVariantBlack },
      data: { price: '2000.00' },
    });

    const res = await getCart(customerToken);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('2000.00');
    expect(res.body.data.discountAmount).toBe('200.00');
  });
});

// ---------------------------------------------------------------------------
// Multiple coupons — one at a time
// ---------------------------------------------------------------------------

describe('Coupons — Single coupon replacement', () => {
  it('31. An invalid replacement leaves the valid coupon in place', async () => {
    await createCoupon({ code: 'SAVE20', discountValue: '20.00' });
    await fillCartTshirt();
    const first = await applyCoupon(customerToken, 'SAVE20');
    expect(first.body.data.coupon.code).toBe('SAVE20');

    const second = await applyCoupon(customerToken, 'NOSUCHCODE');
    expect(second.status).toBe(HTTP_STATUS.NOT_FOUND);

    const cart = await getCart(customerToken);
    expect(cart.body.data.coupon.code).toBe('SAVE20');
    expect(cart.body.data.discountAmount).toBe('200.00');
  });

  it('32. A valid coupon replaces the previously applied coupon', async () => {
    await createCoupon({ code: 'SAVE20', discountValue: '20.00' });
    await createCoupon({
      code: 'FLAT100',
      discountType: 'FIXED_AMOUNT',
      discountValue: '100.00',
    });
    await fillCartTshirt();
    await applyCoupon(customerToken, 'SAVE20');

    const res = await applyCoupon(customerToken, 'FLAT100');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.coupon.code).toBe('FLAT100');
    expect(res.body.data.discountAmount).toBe('100.00');
  });

  it('32b. Removing a coupon restores undiscounted pricing', async () => {
    await createCoupon({ code: 'SAVE20', discountValue: '20.00' });
    await fillCartTshirt();
    await applyCoupon(customerToken, 'SAVE20');

    const res = await removeCoupon(customerToken);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.coupon).toBeNull();
    expect(res.body.data.discountAmount).toBe('0.00');
    expect(res.body.data.finalSubtotal).toBe('1000.00');
    expect(res.body.data.items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

describe('Coupons — Security', () => {
  it('33. Client-supplied discountAmount is ignored', async () => {
    await createCoupon({ code: 'SAVE20', discountValue: '20.00' });
    await fillCartTshirt();

    const res = await applyCoupon(customerToken, 'SAVE20', { discountAmount: '1.00' });
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.discountAmount).toBe('200.00');
  });

  it('34. Client-supplied subtotal is ignored', async () => {
    await createCoupon({ code: 'SAVE20', discountValue: '20.00' });
    await fillCartTshirt();

    const res = await applyCoupon(customerToken, 'SAVE20', { subtotal: '1.00' });
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('1000.00');
    expect(res.body.data.discountAmount).toBe('200.00');
  });

  it('35. Client-supplied product eligibility is ignored', async () => {
    await createCoupon({
      code: 'TSHIRT20',
      discountValue: '20.00',
      scope: 'PRODUCT',
      productIds: [tshirtProductId],
    });
    await addToCart(customerToken, jeansVariantId, 1);

    const res = await applyCoupon(customerToken, 'TSHIRT20', {
      productIds: [/* jeans should not become eligible */],
      eligible: true,
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('36. A user cannot see another user\'s applied coupon', async () => {
    await createCoupon({ code: 'SAVE20', discountValue: '20.00' });
    await fillCartTshirt();
    await applyCoupon(customerToken, 'SAVE20');

    const otherCart = await getCart(otherCustomerToken);
    expect(otherCart.status).toBe(HTTP_STATUS.OK);
    expect(otherCart.body.data.coupon).toBeNull();
    expect(otherCart.body.data.items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Unavailable items and stored coupon GET
// ---------------------------------------------------------------------------

describe('Coupons — Unavailable items and stored state', () => {
  it('excludes unavailable items from the discount', async () => {
    await createCoupon({ code: 'CART10', discountValue: '10.00', scope: 'CART' });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(customerToken, jeansVariantId, 1);
    await applyCoupon(customerToken, 'CART10');

    await prisma.productVariant.update({
      where: { id: tshirtVariantBlack },
      data: { status: 'INACTIVE' },
    });

    const res = await getCart(customerToken);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.subtotal).toBe('3000.00');
    expect(res.body.data.coupon.eligibleSubtotal).toBe('2000.00');
    expect(res.body.data.discountAmount).toBe('200.00');
  });

  it('GET cart returns the revalidated stored coupon without re-sending the code', async () => {
    await createCoupon({ code: 'SAVE20', discountValue: '20.00' });
    await fillCartTshirt();
    await applyCoupon(customerToken, 'save20');

    const res = await getCart(customerToken);
    expect(res.body.data.coupon.code).toBe('SAVE20');
    expect(res.body.data.discountAmount).toBe('200.00');
  });
});

// ---------------------------------------------------------------------------
// Concurrency / consumeCouponUsage (order-time primitive)
// ---------------------------------------------------------------------------

describe('Coupons — Usage consumption concurrency', () => {
  it('37. Concurrent cart apply does not consume usage', async () => {
    const coupon = await createCoupon({
      code: 'RACE10',
      discountValue: '10.00',
      usageLimit: 1,
    });
    await addToCart(customerToken, tshirtVariantBlack, 1);
    await addToCart(otherCustomerToken, jeansVariantId, 1);

    const results = await Promise.all([
      applyCoupon(customerToken, 'RACE10'),
      applyCoupon(otherCustomerToken, 'RACE10'),
    ]);

    expect(results.every((r) => r.status === HTTP_STATUS.OK)).toBe(true);
    const usageCount = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
    expect(usageCount).toBe(0);
  });

  it('38. consumeCouponUsage serialises the last remaining use', async () => {
    const coupon = await createCoupon({
      code: 'LASTONE',
      discountValue: '10.00',
      usageLimit: 1,
    });

    const attempts = await Promise.allSettled([
      couponService.runTransaction((tx) =>
        couponService.consumeCouponUsage(tx, {
          couponId: coupon.id,
          userId: customerId,
          orderId: null,
          discountAmount: new Prisma.Decimal('100.00'),
        }),
      ),
      couponService.runTransaction((tx) =>
        couponService.consumeCouponUsage(tx, {
          couponId: coupon.id,
          userId: otherCustomerId,
          orderId: null,
          discountAmount: new Prisma.Decimal('100.00'),
        }),
      ),
    ]);

    const fulfilled = attempts.filter((r) => r.status === 'fulfilled');
    const rejected = attempts.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const usageCount = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
    expect(usageCount).toBe(1);
  });

  it('38b. Unique coupon codes are case-insensitive because codes are stored uppercase', async () => {
    await createCoupon({ code: 'SAVE20' });
    await expect(createCoupon({ code: 'SAVE20' })).rejects.toThrow();
  });
});
