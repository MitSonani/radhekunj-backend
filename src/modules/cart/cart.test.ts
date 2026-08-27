/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
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

let variantBlackM: string;
let variantBlackL: string;
let variantWhiteM: string;

/**
 * Creates a minimal product with variant+inventory for tests.
 * Returns the created variant ID.
 */
async function seedVariant(opts: {
  sku: string;
  price?: string;
  compareAtPrice?: string | null;
  quantity?: number;
  variantStatus?: 'ACTIVE' | 'INACTIVE';
  productStatus?: 'ACTIVE' | 'INACTIVE';
  categoryId: string;
  colorValueId: string;
  sizeValueId: string;
}): Promise<string> {
  const product = await prisma.product.create({
    data: {
      name: `Product ${opts.sku}`,
      slug: `product-${opts.sku.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      basePrice: opts.price ?? '999.00',
      status: opts.productStatus ?? 'ACTIVE',
      categoryId: opts.categoryId,
      variants: {
        create: {
          sku: opts.sku,
          price: opts.price ?? '999.00',
          compareAtPrice: opts.compareAtPrice,
          status: opts.variantStatus ?? 'ACTIVE',
          attributes: {
            create: [
              { attributeValueId: opts.colorValueId },
              { attributeValueId: opts.sizeValueId },
            ],
          },
          inventory: {
            create: { quantity: opts.quantity ?? 10, reservedQuantity: 0 },
          },
        },
      },
    },
    select: { variants: { select: { id: true } } },
  });

  return product.variants[0]!.id;
}

// ---------------------------------------------------------------------------
// Database setup / teardown
// ---------------------------------------------------------------------------

async function cleanDatabase() {
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

beforeEach(async () => {
  await cleanDatabase();

  vi.mocked(s3Service.buildPublicUrl).mockImplementation(
    (key: string) => `https://cdn.example.com/${key}`,
  );

  const adminRole = await prisma.role.create({ data: { name: 'admin' } });
  const customerRole = await prisma.role.create({ data: { name: 'customer' } });

  await prisma.user.create({
    data: { name: 'Admin User', mobileNumber: '9999999990', roleId: adminRole.id },
  });

  const customerUser = await prisma.user.create({
    data: { name: 'Customer One', mobileNumber: '8888888881', roleId: customerRole.id },
  });

  const otherUser = await prisma.user.create({
    data: { name: 'Customer Two', mobileNumber: '7777777771', roleId: customerRole.id },
  });

  customerToken = jwt.sign({ id: customerUser.id }, appConfig.jwtSecret);
  otherCustomerToken = jwt.sign({ id: otherUser.id }, appConfig.jwtSecret);

  const category = await prisma.category.create({ data: { name: 'Shirts', slug: 'shirts' } });

  const color = await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });
  const size = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });

  const colorBlack = await prisma.attributeValue.create({
    data: { attributeId: color.id, value: 'Black', slug: 'black', colorCode: '#000000' },
  });
  const colorWhite = await prisma.attributeValue.create({
    data: { attributeId: color.id, value: 'White', slug: 'white', colorCode: '#FFFFFF' },
  });
  const sizeM = await prisma.attributeValue.create({
    data: { attributeId: size.id, value: 'M', slug: 'm' },
  });
  const sizeL = await prisma.attributeValue.create({
    data: { attributeId: size.id, value: 'L', slug: 'l' },
  });

  variantBlackM = await seedVariant({
    sku: 'CART-TSH-BLK-M',
    price: '999.00',
    compareAtPrice: '1299.00',
    quantity: 10,
    categoryId: category.id,
    colorValueId: colorBlack.id,
    sizeValueId: sizeM.id,
  });

  variantBlackL = await seedVariant({
    sku: 'CART-TSH-BLK-L',
    price: '1099.00',
    quantity: 5,
    categoryId: category.id,
    colorValueId: colorBlack.id,
    sizeValueId: sizeL.id,
  });

  variantWhiteM = await seedVariant({
    sku: 'CART-TSH-WHT-M',
    price: '899.00',
    quantity: 3,
    categoryId: category.id,
    colorValueId: colorWhite.id,
    sizeValueId: sizeM.id,
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

async function clearCart(token: string) {
  return request(app).delete('/api/v1/cart').set(authHeader(token));
}

// ---------------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------------

describe('Cart — Authentication', () => {
  it('1. Unauthenticated user cannot get cart', async () => {
    const res = await request(app).get('/api/v1/cart');
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('2. Unauthenticated user cannot add to cart', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .send({ variantId: variantBlackM, quantity: 1 });
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('3. Unauthenticated user cannot update cart item', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001';
    const res = await request(app)
      .patch(`/api/v1/cart/items/${fakeId}`)
      .send({ quantity: 2 });
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('4. Unauthenticated user cannot remove cart item', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001';
    const res = await request(app).delete(`/api/v1/cart/items/${fakeId}`);
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('4b. Unauthenticated user cannot clear cart', async () => {
    const res = await request(app).delete('/api/v1/cart');
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// ADD TO CART
// ---------------------------------------------------------------------------

describe('Cart — Add to cart (POST /api/v1/cart/items)', () => {
  it('5. Add a valid active variant', async () => {
    const res = await addToCart(customerToken, variantBlackM, 2);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(2);
    expect(res.body.data.items[0].variantId).toBe(variantBlackM);
  });

  it('6. Add the same variant twice — quantities are combined', async () => {
    await addToCart(customerToken, variantBlackM, 2);
    const res = await addToCart(customerToken, variantBlackM, 3);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(5);
  });

  it('7. Add different variants creates separate line items', async () => {
    await addToCart(customerToken, variantBlackM, 1);
    const res = await addToCart(customerToken, variantBlackL, 2);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.itemsCount).toBe(2);
    expect(res.body.data.totalQuantity).toBe(3);
  });

  it('8. Inactive variant is rejected', async () => {
    await prisma.productVariant.update({
      where: { id: variantBlackM },
      data: { status: 'INACTIVE' },
    });

    const res = await addToCart(customerToken, variantBlackM, 1);

    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.success).toBe(false);
  });

  it('9. Inactive product is rejected', async () => {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantBlackM },
      select: { productId: true },
    });
    await prisma.product.update({
      where: { id: variant!.productId },
      data: { status: 'INACTIVE' },
    });

    const res = await addToCart(customerToken, variantBlackM, 1);

    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.success).toBe(false);
  });

  it('10. Non-existent variant ID is rejected', async () => {
    const res = await addToCart(
      customerToken,
      '00000000-0000-0000-0000-000000000000',
      1,
    );

    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// QUANTITY VALIDATION
// ---------------------------------------------------------------------------

describe('Cart — Quantity validation', () => {
  it('11. Quantity of 1 is accepted', async () => {
    const res = await addToCart(customerToken, variantBlackM, 1);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.items[0].quantity).toBe(1);
  });

  it('12. Quantity of 0 is rejected', async () => {
    const res = await addToCart(customerToken, variantBlackM, 0);
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('13. Negative quantity is rejected', async () => {
    const res = await addToCart(customerToken, variantBlackM, -1);
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('14. Quantity above available stock is rejected', async () => {
    // variantBlackM has stock of 10; requesting 11 should fail
    const res = await addToCart(customerToken, variantBlackM, 11);
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.success).toBe(false);
  });

  it('15. Existing cart quantity + requested quantity above stock is rejected', async () => {
    // Add 8 first
    await addToCart(customerToken, variantBlackM, 8);
    // Now try to add 3 more (total would be 11 > stock of 10)
    const res = await addToCart(customerToken, variantBlackM, 3);
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OWNERSHIP / SECURITY
// ---------------------------------------------------------------------------

describe('Cart — Ownership security', () => {
  it('16. User cannot update another user\'s cart item', async () => {
    // Customer adds to their own cart
    const addRes = await addToCart(customerToken, variantBlackM, 1);
    const cartItemId = addRes.body.data.items[0].id;

    // Other customer tries to update it
    const res = await updateCartItem(otherCustomerToken, cartItemId, 3);

    expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    expect(res.body.success).toBe(false);
  });

  it('17. User cannot delete another user\'s cart item', async () => {
    const addRes = await addToCart(customerToken, variantBlackM, 1);
    const cartItemId = addRes.body.data.items[0].id;

    const res = await removeCartItem(otherCustomerToken, cartItemId);

    expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET CART
// ---------------------------------------------------------------------------

describe('Cart — GET /api/v1/cart', () => {
  it('18. Get empty cart when no cart exists', async () => {
    const res = await getCart(customerToken);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeNull();
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.itemsCount).toBe(0);
    expect(res.body.data.totalQuantity).toBe(0);
    expect(res.body.data.subtotal).toBe('0.00');
  });

  it('19. Get populated cart includes correct items', async () => {
    await addToCart(customerToken, variantBlackM, 2);
    await addToCart(customerToken, variantBlackL, 1);

    const res = await getCart(customerToken);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.itemsCount).toBe(2);
    expect(res.body.data.totalQuantity).toBe(3);
  });

  it('20. Cart item includes correct product information', async () => {
    await addToCart(customerToken, variantBlackM, 1);

    const res = await getCart(customerToken);
    const item = res.body.data.items[0];

    expect(item.variant.product).toMatchObject({
      name: expect.any(String),
      slug: expect.any(String),
      status: 'ACTIVE',
    });
    expect(item.variant.product.id).toBeDefined();
  });

  it('21. Cart item includes correct attributes', async () => {
    await addToCart(customerToken, variantBlackM, 1);

    const res = await getCart(customerToken);
    const item = res.body.data.items[0];

    expect(item.variant.attributes).toHaveLength(2);

    const colorAttr = item.variant.attributes.find(
      (a: { attributeValue: { attribute: { slug: string } } }) =>
        a.attributeValue.attribute.slug === 'color',
    );
    const sizeAttr = item.variant.attributes.find(
      (a: { attributeValue: { attribute: { slug: string } } }) =>
        a.attributeValue.attribute.slug === 'size',
    );

    expect(colorAttr).toBeDefined();
    expect(colorAttr.attributeValue.value).toBe('Black');
    expect(sizeAttr).toBeDefined();
    expect(sizeAttr.attributeValue.value).toBe('M');
  });

  it('22. Cart item includes an image when one is associated', async () => {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantBlackM },
      select: { productId: true },
    });

    await prisma.productImage.create({
      data: {
        productId: variant!.productId,
        objectKey: `products/${variant!.productId}/test.jpg`,
        isPrimary: true,
        altText: 'Test image',
      },
    });

    await addToCart(customerToken, variantBlackM, 1);
    const res = await getCart(customerToken);
    const item = res.body.data.items[0];

    expect(item.variant.image).not.toBeNull();
    expect(item.variant.image.imageUrl).toContain('https://cdn.example.com/');
    expect(item.variant.image.altText).toBe('Test image');
  });

  it('23. Cart item image is null when no product images exist', async () => {
    await addToCart(customerToken, variantBlackM, 1);
    const res = await getCart(customerToken);
    const item = res.body.data.items[0];

    expect(item.variant.image).toBeNull();
  });

  it('24. Cart item includes correct price from variant', async () => {
    await addToCart(customerToken, variantBlackM, 2);

    const res = await getCart(customerToken);
    const item = res.body.data.items[0];

    expect(item.variant.price).toBe('999.00');
    expect(item.variant.compareAtPrice).toBe('1299.00');
  });

  it('25. Cart totals are correct', async () => {
    // variantBlackM: price 999.00 × 2 = 1998.00
    // variantBlackL: price 1099.00 × 1 = 1099.00
    // subtotal = 3097.00
    await addToCart(customerToken, variantBlackM, 2);
    await addToCart(customerToken, variantBlackL, 1);

    const res = await getCart(customerToken);

    expect(res.body.data.subtotal).toBe('3097.00');
    expect(res.body.data.totalQuantity).toBe(3);
    expect(res.body.data.itemsCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// UPDATE CART ITEM
// ---------------------------------------------------------------------------

describe('Cart — PATCH /api/v1/cart/items/:cartItemId', () => {
  it('26. Update quantity successfully', async () => {
    const addRes = await addToCart(customerToken, variantBlackM, 2);
    const cartItemId = addRes.body.data.items[0].id;

    const res = await updateCartItem(customerToken, cartItemId, 5);

    expect(res.status).toBe(HTTP_STATUS.OK);
    const updated = res.body.data.items.find((i: { id: string }) => i.id === cartItemId);
    expect(updated.quantity).toBe(5);
  });

  it('27. Update quantity above stock is rejected', async () => {
    const addRes = await addToCart(customerToken, variantBlackM, 2);
    const cartItemId = addRes.body.data.items[0].id;

    // Stock is 10; requesting 15 should fail
    const res = await updateCartItem(customerToken, cartItemId, 15);

    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.success).toBe(false);
  });

  it('28. Update non-existent cart item returns 404', async () => {
    const res = await updateCartItem(
      customerToken,
      '00000000-0000-0000-0000-000000000001',
      2,
    );

    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
  });

  it('29. Update with quantity 0 is rejected by validation', async () => {
    const addRes = await addToCart(customerToken, variantBlackM, 1);
    const cartItemId = addRes.body.data.items[0].id;

    const res = await updateCartItem(customerToken, cartItemId, 0);
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('30. Update inactive variant is rejected', async () => {
    const addRes = await addToCart(customerToken, variantBlackM, 2);
    const cartItemId = addRes.body.data.items[0].id;

    await prisma.productVariant.update({
      where: { id: variantBlackM },
      data: { status: 'INACTIVE' },
    });

    const res = await updateCartItem(customerToken, cartItemId, 3);
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });
});

// ---------------------------------------------------------------------------
// REMOVE CART ITEM
// ---------------------------------------------------------------------------

describe('Cart — DELETE /api/v1/cart/items/:cartItemId', () => {
  it('31. Remove cart item successfully', async () => {
    await addToCart(customerToken, variantBlackM, 1);
    await addToCart(customerToken, variantBlackL, 1);
    const cartRes = await getCart(customerToken);
    const cartItemId = cartRes.body.data.items[0].id;

    const res = await removeCartItem(customerToken, cartItemId);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.items).toHaveLength(1);
  });

  it('32. Removing a non-existent cart item returns 404', async () => {
    const res = await removeCartItem(
      customerToken,
      '00000000-0000-0000-0000-000000000001',
    );

    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
  });
});

// ---------------------------------------------------------------------------
// CLEAR CART
// ---------------------------------------------------------------------------

describe('Cart — DELETE /api/v1/cart', () => {
  it('33. Clear cart removes all items', async () => {
    await addToCart(customerToken, variantBlackM, 1);
    await addToCart(customerToken, variantBlackL, 2);
    await addToCart(customerToken, variantWhiteM, 1);

    const res = await clearCart(customerToken);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.totalQuantity).toBe(0);
    expect(res.body.data.subtotal).toBe('0.00');
  });

  it('34. Clearing an already-empty cart is safe', async () => {
    // No items added
    const res = await clearCart(customerToken);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CONCURRENCY
// ---------------------------------------------------------------------------

describe('Cart — Concurrency', () => {
  it('35. Concurrent add-to-cart does not create duplicate CartItems', async () => {
    // Fire 5 simultaneous adds of the same variant
    const results = await Promise.all(
      Array.from({ length: 5 }, () => addToCart(customerToken, variantBlackM, 1)),
    );

    // Count how many succeeded and how many failed (due to stock or race)
    const successes = results.filter((r) => r.status === HTTP_STATUS.OK);
    expect(successes.length).toBeGreaterThan(0);

    // The cart should have exactly ONE item for this variant
    const cartRes = await getCart(customerToken);
    const variantItems = cartRes.body.data.items.filter(
      (i: { variantId: string }) => i.variantId === variantBlackM,
    );
    expect(variantItems).toHaveLength(1);
  });

  it('36. Stock validation prevents total quantity exceeding stock under concurrency', async () => {
    // Stock is 10; request 3 units 5 times = 15 total. Some must be rejected.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => addToCart(customerToken, variantBlackM, 3)),
    );

    const cartRes = await getCart(customerToken);
    const item = cartRes.body.data.items.find(
      (i: { variantId: string }) => i.variantId === variantBlackM,
    );
    const finalQuantity = item?.quantity ?? 0;

    // Final quantity must never exceed available stock (10)
    expect(finalQuantity).toBeLessThanOrEqual(10);

    // At least one request must have failed when stock would be exceeded
    const failures = results.filter((r) => r.status !== HTTP_STATUS.OK);
    if (finalQuantity >= 10) {
      expect(failures.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// STALE CART ITEMS (isAvailable / stockWarning flags)
// ---------------------------------------------------------------------------

describe('Cart — Stale items are surfaced to the client', () => {
  it('37. isAvailable is false when variant becomes inactive after being added', async () => {
    await addToCart(customerToken, variantBlackM, 1);

    await prisma.productVariant.update({
      where: { id: variantBlackM },
      data: { status: 'INACTIVE' },
    });

    const res = await getCart(customerToken);
    const item = res.body.data.items[0];

    expect(item.variant.isAvailable).toBe(false);
  });

  it('38. stockWarning is true when cart quantity exceeds current stock', async () => {
    // Add 5 to cart first
    await addToCart(customerToken, variantBlackM, 5);

    // Reduce stock to 3
    await prisma.inventory.updateMany({
      where: { variant: { id: variantBlackM } },
      data: { quantity: 3 },
    });

    const res = await getCart(customerToken);
    const item = res.body.data.items[0];

    expect(item.variant.stockWarning).toBe(true);
  });
});
