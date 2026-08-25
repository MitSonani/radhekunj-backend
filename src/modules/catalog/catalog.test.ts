/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

// --- Test constants ---

const BASE_URL = '/api/v1/products';

const GENERIC_IMAGE_KEY = (productId: string) =>
  `products/${productId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg`;

const COLOR_IMAGE_KEY = (productId: string, colorValueId: string) =>
  `products/${productId}/colors/${colorValueId}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg`;

const EXPECTED_IMAGE_URL_PREFIX = 'https://test-category-images.s3.ap-south-1.amazonaws.com/';

// --- Test suite ---

describe('Public Catalog API', () => {
  const app = createApp();

  let categoryId: string;
  let categorySlug: string;
  let sizeMId: string;
  let sizeLId: string;
  let colorBlackId: string;
  let colorWhiteId: string;

  beforeEach(async () => {
    await prisma.productImage.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.productVariantAttribute.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.attributeValue.deleteMany({});
    await prisma.attribute.deleteMany({});
    await prisma.category.deleteMany({});

    const category = await prisma.category.create({
      data: { name: 'T-Shirts', slug: 't-shirts' },
    });
    categoryId = category.id;
    categorySlug = category.slug;

    const sizeAttr = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
    const colorAttr = await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });

    const sizeM = await prisma.attributeValue.create({
      data: { attributeId: sizeAttr.id, value: 'M', slug: 'm' },
    });
    const sizeL = await prisma.attributeValue.create({
      data: { attributeId: sizeAttr.id, value: 'L', slug: 'l' },
    });
    const colorBlack = await prisma.attributeValue.create({
      data: { attributeId: colorAttr.id, value: 'Black', slug: 'black', colorCode: '#000000' },
    });
    const colorWhite = await prisma.attributeValue.create({
      data: { attributeId: colorAttr.id, value: 'White', slug: 'white', colorCode: '#FFFFFF' },
    });

    sizeMId = sizeM.id;
    sizeLId = sizeL.id;
    colorBlackId = colorBlack.id;
    colorWhiteId = colorWhite.id;
  });

  afterAll(async () => {
    await prisma.productImage.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.productVariantAttribute.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.attributeValue.deleteMany({});
    await prisma.attribute.deleteMany({});
    await prisma.category.deleteMany({});
  });

  // --- Helpers ---

  async function createActiveProduct(overrides: {
    name?: string;
    slug?: string;
    basePrice?: string;
    description?: string;
  } = {}) {
    return prisma.product.create({
      data: {
        categoryId,
        name: overrides.name ?? 'Test T-Shirt',
        slug: overrides.slug ?? 'test-t-shirt',
        basePrice: overrides.basePrice ?? '999.00',
        description: overrides.description ?? null,
        status: 'ACTIVE',
      },
    });
  }

  async function createActiveVariant(
    productId: string,
    sku: string,
    price: string,
    attributeValueIds: string[],
    quantity = 10,
    compareAtPrice?: string,
  ) {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku,
        price,
        compareAtPrice: compareAtPrice ?? null,
        status: 'ACTIVE',
        attributes: {
          create: attributeValueIds.map((id) => ({ attributeValueId: id })),
        },
        inventory: {
          create: { quantity, reservedQuantity: 0 },
        },
      },
    });
    return variant;
  }

  async function createPrimaryImage(productId: string, objectKey?: string) {
    return prisma.productImage.create({
      data: {
        productId,
        objectKey: objectKey ?? GENERIC_IMAGE_KEY(productId),
        isPrimary: true,
        sortOrder: 0,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/products — Product Listing
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/products', () => {
    it('should be publicly accessible without authentication', async () => {
      const response = await request(app).get(BASE_URL);
      expect(response.status).toBe(HTTP_STATUS.OK);
    });

    it('should return paginated product listing with default pagination', async () => {
      await createActiveProduct({ name: 'Shirt A', slug: 'shirt-a' });
      await createActiveProduct({ name: 'Shirt B', slug: 'shirt-b' });

      const response = await request(app).get(BASE_URL);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('should only return ACTIVE products — inactive products are hidden', async () => {
      await createActiveProduct({ name: 'Active Shirt', slug: 'active-shirt' });
      await prisma.product.create({
        data: {
          categoryId,
          name: 'Inactive Shirt',
          slug: 'inactive-shirt',
          basePrice: '500.00',
          status: 'INACTIVE',
        },
      });

      const response = await request(app).get(BASE_URL);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Active Shirt');
    });

    it('should return correct product fields for listing', async () => {
      const product = await createActiveProduct({
        name: 'Cotton Tee',
        slug: 'cotton-tee',
        basePrice: '799.00',
      });
      await createPrimaryImage(product.id);

      const response = await request(app).get(BASE_URL);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const item = response.body.data[0];

      expect(item).toMatchObject({
        id: product.id,
        name: 'Cotton Tee',
        slug: 'cotton-tee',
        price: '799.00',
        category: { name: 'T-Shirts', slug: 't-shirts' },
      });
      expect(item.primaryImage).not.toBeNull();
      expect(item.primaryImage.url).toContain(EXPECTED_IMAGE_URL_PREFIX);
    });

    it('should return null primaryImage when product has no primary image', async () => {
      await createActiveProduct({ name: 'Imageless Shirt', slug: 'imageless-shirt' });

      const response = await request(app).get(BASE_URL);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data[0].primaryImage).toBeNull();
    });

    it('should NOT expose internal inventory or admin-only fields in listing', async () => {
      const product = await createActiveProduct();
      await createActiveVariant(product.id, 'SKU-001', '999.00', [colorBlackId, sizeMId], 5);
      await createPrimaryImage(product.id);

      const response = await request(app).get(BASE_URL);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const item = response.body.data[0];

      // Admin/internal fields must not appear on the product
      expect(item).not.toHaveProperty('status');
      expect(item).not.toHaveProperty('categoryId');
      expect(item).not.toHaveProperty('createdAt');
      expect(item).not.toHaveProperty('updatedAt');
      expect(item).not.toHaveProperty('variants');
      expect(item).not.toHaveProperty('basePrice');

      // Image must not expose objectKey or isPrimary
      expect(item.primaryImage).not.toBeNull();
      expect(item.primaryImage).not.toHaveProperty('objectKey');
      expect(item.primaryImage).not.toHaveProperty('isPrimary');
      expect(item.primaryImage).not.toHaveProperty('productId');
    });

    it('should support pagination via page and limit query params', async () => {
      for (let i = 1; i <= 5; i += 1) {
        await createActiveProduct({ name: `Shirt ${i}`, slug: `shirt-${i}` });
      }

      const page1 = await request(app).get(BASE_URL).query({ page: 1, limit: 2 });
      const page2 = await request(app).get(BASE_URL).query({ page: 2, limit: 2 });
      const page3 = await request(app).get(BASE_URL).query({ page: 3, limit: 2 });

      expect(page1.status).toBe(HTTP_STATUS.OK);
      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.pagination).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });

      expect(page2.body.data).toHaveLength(2);
      expect(page2.body.pagination.page).toBe(2);

      expect(page3.body.data).toHaveLength(1);
      expect(page3.body.pagination.page).toBe(3);
    });

    it('should reject invalid pagination params with 422', async () => {
      const response = await request(app).get(BASE_URL).query({ page: 0 });
      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });

    it('should filter products by search (name match)', async () => {
      await createActiveProduct({ name: 'Linen Hoodie', slug: 'linen-hoodie' });
      await createActiveProduct({ name: 'Cotton T-Shirt', slug: 'cotton-t-shirt' });

      const response = await request(app).get(BASE_URL).query({ search: 'hoodie' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Linen Hoodie');
    });

    it('should filter products by search (slug match)', async () => {
      await createActiveProduct({ name: 'Premium Polo', slug: 'premium-polo' });
      await createActiveProduct({ name: 'Basic Tee', slug: 'basic-tee' });

      const response = await request(app).get(BASE_URL).query({ search: 'polo' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].slug).toBe('premium-polo');
    });

    it('should filter products by active category slug', async () => {
      const otherCategory = await prisma.category.create({
        data: { name: 'Hoodies', slug: 'hoodies' },
      });

      await prisma.product.create({
        data: {
          categoryId: otherCategory.id,
          name: 'Zip Hoodie',
          slug: 'zip-hoodie',
          basePrice: '1499.00',
          status: 'ACTIVE',
        },
      });
      await createActiveProduct({ name: 'Crew Tee', slug: 'crew-tee' });

      const response = await request(app)
        .get(BASE_URL)
        .query({ categorySlug: 't-shirts' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Crew Tee');
    });

    it('should return 404 when filtering by a non-existent category slug', async () => {
      const response = await request(app)
        .get(BASE_URL)
        .query({ categorySlug: 'does-not-exist' });

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('should return 404 when filtering by an inactive category slug', async () => {
      await prisma.category.create({
        data: { name: 'Archive', slug: 'archive', status: 'INACTIVE' },
      });

      const response = await request(app)
        .get(BASE_URL)
        .query({ categorySlug: 'archive' });

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('should sort products by newest (default)', async () => {
      const older = await prisma.product.create({
        data: {
          categoryId,
          name: 'Older Shirt',
          slug: 'older-shirt',
          basePrice: '500.00',
          status: 'ACTIVE',
          createdAt: new Date('2024-01-01'),
        },
      });
      const newer = await prisma.product.create({
        data: {
          categoryId,
          name: 'Newer Shirt',
          slug: 'newer-shirt',
          basePrice: '600.00',
          status: 'ACTIVE',
          createdAt: new Date('2024-06-01'),
        },
      });

      const response = await request(app).get(BASE_URL).query({ sort: 'newest' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data[0].id).toBe(newer.id);
      expect(response.body.data[1].id).toBe(older.id);
    });

    it('should sort products by price ascending', async () => {
      await createActiveProduct({ name: 'Expensive Shirt', slug: 'expensive-shirt', basePrice: '1500.00' });
      await createActiveProduct({ name: 'Cheap Shirt', slug: 'cheap-shirt', basePrice: '300.00' });
      await createActiveProduct({ name: 'Mid Shirt', slug: 'mid-shirt', basePrice: '800.00' });

      const response = await request(app).get(BASE_URL).query({ sort: 'price_asc' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data[0].price).toBe('300.00');
      expect(response.body.data[1].price).toBe('800.00');
      expect(response.body.data[2].price).toBe('1500.00');
    });

    it('should sort products by price descending', async () => {
      await createActiveProduct({ name: 'Expensive Shirt', slug: 'expensive-shirt', basePrice: '1500.00' });
      await createActiveProduct({ name: 'Cheap Shirt', slug: 'cheap-shirt', basePrice: '300.00' });

      const response = await request(app).get(BASE_URL).query({ sort: 'price_desc' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data[0].price).toBe('1500.00');
      expect(response.body.data[1].price).toBe('300.00');
    });

    it('should reject an invalid sort value with 422', async () => {
      const response = await request(app).get(BASE_URL).query({ sort: 'invalid_sort' });
      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/products/:slug — Product Detail
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/products/:slug', () => {
    it('should be publicly accessible without authentication', async () => {
      const product = await createActiveProduct({ name: 'Open Shirt', slug: 'open-shirt' });
      const response = await request(app).get(`${BASE_URL}/${product.slug}`);
      expect(response.status).toBe(HTTP_STATUS.OK);
    });

    it('should return full product detail with correct public fields', async () => {
      const product = await createActiveProduct({
        name: 'Premium Tee',
        slug: 'premium-tee',
        basePrice: '999.00',
        description: 'A premium cotton tee',
      });

      const response = await request(app).get(`${BASE_URL}/premium-tee`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: product.id,
        name: 'Premium Tee',
        slug: 'premium-tee',
        price: '999.00',
        description: 'A premium cotton tee',
        category: { name: 'T-Shirts', slug: categorySlug },
        images: [],
        variants: [],
        availableOptions: [],
      });
    });

    it('should return 404 for a non-existent product slug', async () => {
      const response = await request(app).get(`${BASE_URL}/does-not-exist`);
      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('should return 404 for an inactive product', async () => {
      await prisma.product.create({
        data: {
          categoryId,
          name: 'Hidden Product',
          slug: 'hidden-product',
          basePrice: '500.00',
          status: 'INACTIVE',
        },
      });

      const response = await request(app).get(`${BASE_URL}/hidden-product`);
      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('should return only ACTIVE variants — INACTIVE variants are excluded', async () => {
      const product = await createActiveProduct({ name: 'Variant Test', slug: 'variant-test' });
      await createActiveVariant(product.id, 'SKU-ACTIVE', '999.00', [colorBlackId, sizeMId], 5);
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: 'SKU-INACTIVE',
          price: '999.00',
          status: 'INACTIVE',
          attributes: {
            create: [{ attributeValueId: colorWhiteId }, { attributeValueId: sizeLId }],
          },
          inventory: { create: { quantity: 3, reservedQuantity: 0 } },
        },
      });

      const response = await request(app).get(`${BASE_URL}/variant-test`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.variants).toHaveLength(1);
      expect(response.body.data.variants[0].attributes.some(
        (a: { attributeValue: { value: string } }) => a.attributeValue.value === 'Black',
      )).toBe(true);
    });

    it('should return IN_STOCK availability when stock is available', async () => {
      const product = await createActiveProduct({ name: 'Stocked Shirt', slug: 'stocked-shirt' });
      await createActiveVariant(product.id, 'SKU-IN-STOCK', '999.00', [colorBlackId], 10, undefined);

      const response = await request(app).get(`${BASE_URL}/stocked-shirt`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const variant = response.body.data.variants[0];
      expect(variant.availability).toBe('IN_STOCK');
    });

    it('should return OUT_OF_STOCK when quantity minus reserved is zero', async () => {
      const product = await createActiveProduct({ name: 'OOS Shirt', slug: 'oos-shirt' });
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: 'SKU-OOS',
          price: '999.00',
          status: 'ACTIVE',
          attributes: { create: [{ attributeValueId: sizeMId }] },
          inventory: { create: { quantity: 5, reservedQuantity: 5 } },
        },
      });

      const response = await request(app).get(`${BASE_URL}/oos-shirt`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const variantData = response.body.data.variants.find(
        (v: { id: string }) => v.id === variant.id,
      );
      expect(variantData.availability).toBe('OUT_OF_STOCK');
    });

    it('should return OUT_OF_STOCK when inventory quantity is zero', async () => {
      const product = await createActiveProduct({
        name: 'Zero Stock Shirt',
        slug: 'zero-stock-shirt',
      });
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: 'SKU-ZERO',
          price: '999.00',
          status: 'ACTIVE',
          attributes: { create: [{ attributeValueId: sizeLId }] },
          inventory: { create: { quantity: 0, reservedQuantity: 0 } },
        },
      });

      const response = await request(app).get(`${BASE_URL}/zero-stock-shirt`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.variants[0].availability).toBe('OUT_OF_STOCK');
    });

    it('should include out-of-stock ACTIVE variants in the response', async () => {
      const product = await createActiveProduct({
        name: 'Mixed Stock',
        slug: 'mixed-stock',
      });
      await createActiveVariant(product.id, 'SKU-IN', '999.00', [sizeMId], 5);
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: 'SKU-OUT',
          price: '999.00',
          status: 'ACTIVE',
          attributes: { create: [{ attributeValueId: sizeLId }] },
          inventory: { create: { quantity: 0, reservedQuantity: 0 } },
        },
      });

      const response = await request(app).get(`${BASE_URL}/mixed-stock`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.variants).toHaveLength(2);

      const inStock = response.body.data.variants.find(
        (v: { availability: string }) => v.availability === 'IN_STOCK',
      );
      const outOfStock = response.body.data.variants.find(
        (v: { availability: string }) => v.availability === 'OUT_OF_STOCK',
      );
      expect(inStock).toBeDefined();
      expect(outOfStock).toBeDefined();
    });

    it('should expose variant compareAtPrice when set', async () => {
      const product = await createActiveProduct({ name: 'Sale Shirt', slug: 'sale-shirt' });
      await createActiveVariant(
        product.id,
        'SKU-SALE',
        '799.00',
        [colorBlackId],
        5,
        '1299.00',
      );

      const response = await request(app).get(`${BASE_URL}/sale-shirt`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.variants[0].compareAtPrice).toBe('1299.00');
    });

    it('should return null compareAtPrice when not set', async () => {
      const product = await createActiveProduct({ name: 'No Sale', slug: 'no-sale' });
      await createActiveVariant(product.id, 'SKU-NOSALE', '999.00', [colorBlackId], 5);

      const response = await request(app).get(`${BASE_URL}/no-sale`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.variants[0].compareAtPrice).toBeNull();
    });

    it('should return variant attributes with attribute and attributeValue information', async () => {
      const product = await createActiveProduct({ name: 'Attr Shirt', slug: 'attr-shirt' });
      await createActiveVariant(product.id, 'SKU-ATTR', '999.00', [colorBlackId, sizeMId], 5);

      const response = await request(app).get(`${BASE_URL}/attr-shirt`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const variant = response.body.data.variants[0];
      expect(variant.attributes).toHaveLength(2);

      const colorAttr = variant.attributes.find(
        (a: { attribute: { slug: string } }) => a.attribute.slug === 'color',
      );
      expect(colorAttr).toMatchObject({
        attribute: { name: 'Color', slug: 'color' },
        attributeValue: { value: 'Black', slug: 'black', colorCode: '#000000' },
      });

      const sizeAttr = variant.attributes.find(
        (a: { attribute: { slug: string } }) => a.attribute.slug === 'size',
      );
      expect(sizeAttr).toMatchObject({
        attribute: { name: 'Size', slug: 'size' },
        attributeValue: { value: 'M', slug: 'm' },
      });
    });

    it('should derive availableOptions from ACTIVE variants only', async () => {
      const product = await createActiveProduct({ name: 'Options Shirt', slug: 'options-shirt' });
      await createActiveVariant(product.id, 'SKU-OPT-1', '999.00', [colorBlackId, sizeMId], 5);
      await createActiveVariant(product.id, 'SKU-OPT-2', '999.00', [colorWhiteId, sizeLId], 3);
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: 'SKU-OPT-INACTIVE',
          price: '999.00',
          status: 'INACTIVE',
          attributes: {
            create: [{ attributeValueId: colorBlackId }, { attributeValueId: sizeLId }],
          },
          inventory: { create: { quantity: 1, reservedQuantity: 0 } },
        },
      });

      const response = await request(app).get(`${BASE_URL}/options-shirt`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const { availableOptions } = response.body.data;
      expect(availableOptions).toHaveLength(2);

      const colorGroup = availableOptions.find(
        (g: { attribute: { slug: string } }) => g.attribute.slug === 'color',
      );
      expect(colorGroup).toBeDefined();
      expect(colorGroup.values).toHaveLength(2);

      const sizeGroup = availableOptions.find(
        (g: { attribute: { slug: string } }) => g.attribute.slug === 'size',
      );
      expect(sizeGroup).toBeDefined();
      expect(sizeGroup.values).toHaveLength(2);
    });

    it('should return generic images with attributeValueId null', async () => {
      const product = await createActiveProduct({ name: 'Generic Img', slug: 'generic-img' });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          objectKey: GENERIC_IMAGE_KEY(product.id),
          altText: 'Lifestyle photo',
          sortOrder: 0,
          isPrimary: true,
        },
      });

      const response = await request(app).get(`${BASE_URL}/generic-img`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const image = response.body.data.images[0];
      expect(image.attributeValueId).toBeNull();
      expect(image.attributeValue).toBeNull();
      expect(image.altText).toBe('Lifestyle photo');
      expect(image.url).toContain(EXPECTED_IMAGE_URL_PREFIX);
    });

    it('should return color-specific images with correct attributeValueId and colorCode', async () => {
      const product = await createActiveProduct({ name: 'Color Img', slug: 'color-img' });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          objectKey: COLOR_IMAGE_KEY(product.id, colorBlackId),
          attributeValueId: colorBlackId,
          altText: 'Black front',
          sortOrder: 1,
          isPrimary: false,
        },
      });

      const response = await request(app).get(`${BASE_URL}/color-img`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const image = response.body.data.images[0];
      expect(image.attributeValueId).toBe(colorBlackId);
      expect(image.attributeValue).toMatchObject({
        value: 'Black',
        slug: 'black',
        colorCode: '#000000',
        attribute: { slug: 'color' },
      });
    });

    it('should return both generic and color-specific images together', async () => {
      const product = await createActiveProduct({ name: 'Mixed Img', slug: 'mixed-img' });
      await prisma.productImage.createMany({
        data: [
          {
            productId: product.id,
            objectKey: GENERIC_IMAGE_KEY(product.id),
            sortOrder: 0,
            isPrimary: true,
          },
          {
            productId: product.id,
            objectKey: COLOR_IMAGE_KEY(product.id, colorBlackId),
            attributeValueId: colorBlackId,
            sortOrder: 1,
            isPrimary: false,
          },
          {
            productId: product.id,
            objectKey: COLOR_IMAGE_KEY(product.id, colorWhiteId),
            attributeValueId: colorWhiteId,
            sortOrder: 2,
            isPrimary: false,
          },
        ],
      });

      const response = await request(app).get(`${BASE_URL}/mixed-img`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.images).toHaveLength(3);

      const genericImages = response.body.data.images.filter(
        (img: { attributeValueId: string | null }) => img.attributeValueId === null,
      );
      const colorImages = response.body.data.images.filter(
        (img: { attributeValueId: string | null }) => img.attributeValueId !== null,
      );
      expect(genericImages).toHaveLength(1);
      expect(colorImages).toHaveLength(2);
    });

    it('should order images by sortOrder', async () => {
      const product = await createActiveProduct({ name: 'Sorted Img', slug: 'sorted-img' });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          objectKey: GENERIC_IMAGE_KEY(product.id),
          sortOrder: 10,
          isPrimary: false,
          altText: 'Last',
        },
      });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          objectKey: COLOR_IMAGE_KEY(product.id, colorBlackId),
          attributeValueId: colorBlackId,
          sortOrder: 0,
          isPrimary: true,
          altText: 'First',
        },
      });

      const response = await request(app).get(`${BASE_URL}/sorted-img`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.images[0].altText).toBe('First');
      expect(response.body.data.images[1].altText).toBe('Last');
    });

    it('should NOT expose internal inventory quantities in variant response', async () => {
      const product = await createActiveProduct({ name: 'No Qty Leak', slug: 'no-qty-leak' });
      await createActiveVariant(product.id, 'SKU-NOLEAK', '999.00', [colorBlackId], 17);

      const response = await request(app).get(`${BASE_URL}/no-qty-leak`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const variant = response.body.data.variants[0];

      // Must expose availability, not raw quantities
      expect(variant).toHaveProperty('availability');
      expect(variant).not.toHaveProperty('inventory');
      expect(variant.availability).toBe('IN_STOCK');

      // No internal fields
      expect(variant).not.toHaveProperty('quantity');
      expect(variant).not.toHaveProperty('reservedQuantity');
      expect(variant).not.toHaveProperty('productId');
      expect(variant).not.toHaveProperty('status');
      expect(variant).not.toHaveProperty('createdAt');
      expect(variant).not.toHaveProperty('updatedAt');
    });

    it('should NOT expose objectKey, SKU, or admin-only fields in detail response', async () => {
      const product = await createActiveProduct({ name: 'No Admin Leak', slug: 'no-admin-leak' });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          objectKey: GENERIC_IMAGE_KEY(product.id),
          isPrimary: true,
          sortOrder: 0,
        },
      });

      const response = await request(app).get(`${BASE_URL}/no-admin-leak`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const { data } = response.body;

      // Product level
      expect(data).not.toHaveProperty('status');
      expect(data).not.toHaveProperty('categoryId');
      expect(data).not.toHaveProperty('createdAt');
      expect(data).not.toHaveProperty('updatedAt');
      expect(data).not.toHaveProperty('basePrice');

      // Image level
      const image = data.images[0];
      expect(image).not.toHaveProperty('objectKey');
      expect(image).not.toHaveProperty('isPrimary');
      expect(image).not.toHaveProperty('productId');
      expect(image).not.toHaveProperty('createdAt');
      expect(image).not.toHaveProperty('updatedAt');
    });
  });

  // ---------------------------------------------------------------------------
  // Input validation
  // ---------------------------------------------------------------------------

  describe('Input validation', () => {
    it('should reject limit exceeding the maximum', async () => {
      const response = await request(app).get(BASE_URL).query({ limit: 200 });
      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });

    it('should reject a negative page number', async () => {
      const response = await request(app).get(BASE_URL).query({ page: -1 });
      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });

    it('should reject an invalid categorySlug format', async () => {
      const response = await request(app)
        .get(BASE_URL)
        .query({ categorySlug: 'Invalid Category!' });
      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });
  });
});
