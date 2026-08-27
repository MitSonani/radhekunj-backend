/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { appConfig } from '../../config/index.js';
import * as s3Service from '../../shared/services/s3.js';

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

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------

const app = createApp();

let customerToken: string;
let otherCustomerToken: string;

let productIdActive: string;
let productIdActive2: string;
let productIdInactive: string;
let productIdOos: string; // out-of-stock but active product

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function cleanDatabase() {
  await prisma.wishlistItem.deleteMany({});
  await prisma.cartItem.deleteMany({});
  await prisma.cart.deleteMany({});
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

type SeedProductOpts = {
  slug: string;
  name?: string;
  basePrice?: string;
  productStatus?: 'ACTIVE' | 'INACTIVE';
  variantStatus?: 'ACTIVE' | 'INACTIVE';
  quantity?: number;
  categoryId: string;
  withPrimaryImage?: boolean;
  compareAtPrice?: string | null;
};

async function seedProduct(opts: SeedProductOpts): Promise<string> {
  const product = await prisma.product.create({
    data: {
      name: opts.name ?? `Product ${opts.slug}`,
      slug: opts.slug,
      basePrice: opts.basePrice ?? '999.00',
      status: opts.productStatus ?? 'ACTIVE',
      categoryId: opts.categoryId,
      variants: {
        create: {
          sku: `SKU-${opts.slug.toUpperCase()}`,
          price: opts.basePrice ?? '999.00',
          compareAtPrice: opts.compareAtPrice ?? null,
          status: opts.variantStatus ?? 'ACTIVE',
          inventory: {
            create: { quantity: opts.quantity ?? 10, reservedQuantity: 0 },
          },
        },
      },
      ...(opts.withPrimaryImage && {
        images: {
          create: {
            objectKey: `products/test/${opts.slug}/primary.jpg`,
            altText: `${opts.slug} primary image`,
            isPrimary: true,
            sortOrder: 0,
          },
        },
      }),
    },
    select: { id: true },
  });

  return product.id;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

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

  customerToken = jwt.sign({ id: customerUser.id }, appConfig.jwtSecret);
  otherCustomerToken = jwt.sign({ id: otherUser.id }, appConfig.jwtSecret);

  const category = await prisma.category.create({ data: { name: 'Shirts', slug: 'shirts' } });

  productIdActive = await seedProduct({
    slug: 'tshirt-black',
    name: 'Black T-Shirt',
    basePrice: '999.00',
    compareAtPrice: '1299.00',
    quantity: 10,
    categoryId: category.id,
    withPrimaryImage: true,
  });

  productIdActive2 = await seedProduct({
    slug: 'tshirt-white',
    name: 'White T-Shirt',
    basePrice: '799.00',
    quantity: 5,
    categoryId: category.id,
  });

  productIdInactive = await seedProduct({
    slug: 'polo-inactive',
    productStatus: 'INACTIVE',
    quantity: 10,
    categoryId: category.id,
  });

  productIdOos = await seedProduct({
    slug: 'hoodie-oos',
    name: 'Out-of-Stock Hoodie',
    quantity: 0,
    categoryId: category.id,
    withPrimaryImage: true,
  });
});

afterAll(async () => {
  await cleanDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function addToWishlist(token: string, productId: string) {
  return request(app)
    .post('/api/v1/wishlist')
    .set(authHeader(token))
    .send({ productId });
}

async function removeFromWishlist(token: string, productId: string) {
  return request(app)
    .delete(`/api/v1/wishlist/${productId}`)
    .set(authHeader(token));
}

async function getWishlist(token: string) {
  return request(app).get('/api/v1/wishlist').set(authHeader(token));
}

async function checkWishlistStatus(token: string, productId: string) {
  return request(app)
    .get(`/api/v1/wishlist/${productId}/check`)
    .set(authHeader(token));
}

// ---------------------------------------------------------------------------
// 1. AUTHENTICATION
// ---------------------------------------------------------------------------

describe('Wishlist — Authentication', () => {
  it('1. Unauthenticated user cannot get wishlist', async () => {
    const res = await request(app).get('/api/v1/wishlist');
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('2. Unauthenticated user cannot add to wishlist', async () => {
    const res = await request(app)
      .post('/api/v1/wishlist')
      .send({ productId: productIdActive });
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('3. Unauthenticated user cannot remove from wishlist', async () => {
    const res = await request(app).delete(`/api/v1/wishlist/${productIdActive}`);
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// 2. ADD TO WISHLIST
// ---------------------------------------------------------------------------

describe('Wishlist — Add (POST /api/v1/wishlist)', () => {
  it('4. Add a valid active product succeeds', async () => {
    const res = await addToWishlist(customerToken, productIdActive);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.productId).toBe(productIdActive);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.message).toBe('Product added to wishlist');
  });

  it('5. Adding the same product twice is idempotent (no duplicate rows)', async () => {
    await addToWishlist(customerToken, productIdActive);
    const res = await addToWishlist(customerToken, productIdActive);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Product is already in your wishlist');

    const count = await prisma.wishlistItem.count();
    expect(count).toBe(1);
  });

  it('6. Inactive product is rejected with 422', async () => {
    const res = await addToWishlist(customerToken, productIdInactive);

    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.success).toBe(false);
  });

  it('7. Non-existent product ID is rejected with 404', async () => {
    const res = await addToWishlist(
      customerToken,
      '00000000-0000-0000-0000-000000000000',
    );

    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(res.body.success).toBe(false);
  });

  it('8. Invalid UUID format is rejected with 422', async () => {
    const res = await request(app)
      .post('/api/v1/wishlist')
      .set(authHeader(customerToken))
      .send({ productId: 'not-a-uuid' });

    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.success).toBe(false);
  });

  it('9. Missing productId is rejected with 422', async () => {
    const res = await request(app)
      .post('/api/v1/wishlist')
      .set(authHeader(customerToken))
      .send({});

    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.success).toBe(false);
  });

  it('9b. Out-of-stock product can be wishlisted', async () => {
    const res = await addToWishlist(customerToken, productIdOos);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. GET WISHLIST
// ---------------------------------------------------------------------------

describe('Wishlist — GET /api/v1/wishlist', () => {
  it('10. Empty wishlist returns items=[] and count=0', async () => {
    const res = await getWishlist(customerToken);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.count).toBe(0);
  });

  it('11. Populated wishlist returns correct items', async () => {
    await addToWishlist(customerToken, productIdActive);
    await addToWishlist(customerToken, productIdActive2);

    const res = await getWishlist(customerToken);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.count).toBe(2);
  });

  it('12. Wishlist item contains correct product information', async () => {
    await addToWishlist(customerToken, productIdActive);

    const res = await getWishlist(customerToken);
    const item = res.body.data.items[0];

    expect(item.product.id).toBe(productIdActive);
    expect(item.product.name).toBe('Black T-Shirt');
    expect(item.product.slug).toBe('tshirt-black');
    expect(item.product.status).toBe('ACTIVE');
  });

  it('13. Wishlist item contains correct primary image URL', async () => {
    await addToWishlist(customerToken, productIdActive);

    const res = await getWishlist(customerToken);
    const item = res.body.data.items[0];

    expect(item.product.primaryImage).not.toBeNull();
    expect(item.product.primaryImage.url).toContain('https://cdn.example.com/');
    expect(item.product.primaryImage.altText).toBe('tshirt-black primary image');
  });

  it('14. primaryImage is null when product has no images', async () => {
    await addToWishlist(customerToken, productIdActive2);

    const res = await getWishlist(customerToken);
    const item = res.body.data.items[0];

    expect(item.product.primaryImage).toBeNull();
  });

  it('15. Wishlist item contains correct price', async () => {
    await addToWishlist(customerToken, productIdActive);

    const res = await getWishlist(customerToken);
    const item = res.body.data.items[0];

    expect(item.product.price).toBe('999.00');
  });

  it('16. Wishlist item contains correct compareAtPrice when discount exists', async () => {
    await addToWishlist(customerToken, productIdActive);

    const res = await getWishlist(customerToken);
    const item = res.body.data.items[0];

    expect(item.product.compareAtPrice).toBe('1299.00');
  });

  it('16b. compareAtPrice is null when no discount exists', async () => {
    await addToWishlist(customerToken, productIdActive2);

    const res = await getWishlist(customerToken);
    const item = res.body.data.items[0];

    expect(item.product.compareAtPrice).toBeNull();
  });

  it('17. Wishlist count is correct', async () => {
    await addToWishlist(customerToken, productIdActive);
    await addToWishlist(customerToken, productIdActive2);

    const res = await getWishlist(customerToken);

    expect(res.body.data.count).toBe(2);
  });

  it('18. Inactive product is excluded from GET response but DB record is not deleted', async () => {
    // Wishlist an active product
    await addToWishlist(customerToken, productIdActive);

    // Directly insert a wishlist item for the inactive product
    await prisma.wishlistItem.create({
      data: { userId: (await prisma.user.findFirst({ where: { mobileNumber: '8888888881' } }))!.id, productId: productIdInactive },
    });

    const dbCount = await prisma.wishlistItem.count();
    expect(dbCount).toBe(2);

    const res = await getWishlist(customerToken);

    // Only the active product should appear
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.count).toBe(1);

    // DB record for the inactive product must still exist
    const dbCountAfter = await prisma.wishlistItem.count();
    expect(dbCountAfter).toBe(2);
  });

  it('21. Out-of-stock product remains in wishlist with isAvailable=false', async () => {
    await addToWishlist(customerToken, productIdOos);

    const res = await getWishlist(customerToken);
    const item = res.body.data.items[0];

    expect(item.product.isAvailable).toBe(false);
    expect(res.body.data.count).toBe(1);
  });

  it('22. Price reflects current product price, not price at time of wishlisting', async () => {
    await addToWishlist(customerToken, productIdActive);

    // Update the product's basePrice after wishlisting
    await prisma.product.update({
      where: { id: productIdActive },
      data: { basePrice: '1199.00' },
    });

    const res = await getWishlist(customerToken);
    const item = res.body.data.items[0];

    // Should show the updated price, not the original
    expect(item.product.price).toBe('1199.00');
  });

  it('23. isAvailable is true for active in-stock product', async () => {
    await addToWishlist(customerToken, productIdActive);

    const res = await getWishlist(customerToken);
    const item = res.body.data.items[0];

    expect(item.product.isAvailable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. REMOVE FROM WISHLIST
// ---------------------------------------------------------------------------

describe('Wishlist — DELETE /api/v1/wishlist/:productId', () => {
  it('17_remove. Remove wishlisted product successfully', async () => {
    await addToWishlist(customerToken, productIdActive);

    const res = await removeFromWishlist(customerToken, productIdActive);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);

    const count = await prisma.wishlistItem.count();
    expect(count).toBe(0);
  });

  it('18_remove. Remove non-existent wishlist item returns 404', async () => {
    const res = await removeFromWishlist(
      customerToken,
      '00000000-0000-0000-0000-000000000000',
    );

    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(res.body.success).toBe(false);
  });

  it('19. User cannot remove another user\'s wishlist item', async () => {
    // customerToken adds product to their wishlist
    await addToWishlist(customerToken, productIdActive);

    // otherCustomerToken tries to remove it using the productId
    const res = await removeFromWishlist(otherCustomerToken, productIdActive);

    // Should return 404 because the other user has no such wishlist item
    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);

    // The original wishlist item must remain intact
    const count = await prisma.wishlistItem.count();
    expect(count).toBe(1);
  });

  it('invalid UUID productId is rejected with 422', async () => {
    const res = await request(app)
      .delete('/api/v1/wishlist/not-a-uuid')
      .set(authHeader(customerToken));

    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });
});

// ---------------------------------------------------------------------------
// 5. CHECK WISHLIST STATUS
// ---------------------------------------------------------------------------

describe('Wishlist — GET /api/v1/wishlist/:productId/check', () => {
  it('Returns isWishlisted=false when product is not in wishlist', async () => {
    const res = await checkWishlistStatus(customerToken, productIdActive);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isWishlisted).toBe(false);
  });

  it('Returns isWishlisted=true when product is in wishlist', async () => {
    await addToWishlist(customerToken, productIdActive);

    const res = await checkWishlistStatus(customerToken, productIdActive);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.isWishlisted).toBe(true);
  });

  it('isWishlisted is false for a different user', async () => {
    await addToWishlist(customerToken, productIdActive);

    const res = await checkWishlistStatus(otherCustomerToken, productIdActive);

    expect(res.body.data.isWishlisted).toBe(false);
  });

  it('Check endpoint requires authentication', async () => {
    const res = await request(app).get(`/api/v1/wishlist/${productIdActive}/check`);
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// 6. CONCURRENCY
// ---------------------------------------------------------------------------

describe('Wishlist — Concurrency', () => {
  it('20. Concurrent add-to-wishlist does not create duplicate WishlistItems', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => addToWishlist(customerToken, productIdActive)),
    );

    const successes = results.filter((r) => r.status === HTTP_STATUS.OK);
    expect(successes.length).toBe(5); // all idempotent, all succeed

    const count = await prisma.wishlistItem.count();
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. WISHLIST ISOLATION BETWEEN USERS
// ---------------------------------------------------------------------------

describe('Wishlist — User isolation', () => {
  it('Each user has an independent wishlist', async () => {
    await addToWishlist(customerToken, productIdActive);
    await addToWishlist(otherCustomerToken, productIdActive2);

    const res1 = await getWishlist(customerToken);
    const res2 = await getWishlist(otherCustomerToken);

    expect(res1.body.data.count).toBe(1);
    expect(res1.body.data.items[0].product.id).toBe(productIdActive);

    expect(res2.body.data.count).toBe(1);
    expect(res2.body.data.items[0].product.id).toBe(productIdActive2);
  });
});
