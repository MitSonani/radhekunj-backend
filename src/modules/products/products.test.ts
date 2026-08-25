/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS, PRODUCT_IMAGE } from '../../shared/constants/index.js';
import { appConfig } from '../../config/index.js';
import * as s3Service from '../../shared/services/s3.js';

const FILE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REPLACEMENT_FILE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

vi.mock('../../shared/services/s3.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/services/s3.js')>();

  return {
    ...actual,
    createPresignedUploadUrl: vi.fn(),
    assertObjectExists: vi.fn(),
    deleteObjectIfExists: vi.fn(),
  };
});

function genericImageKey(productId: string, fileId = FILE_ID): string {
  return `products/${productId}/${fileId}.jpg`;
}

function colorImageKey(productId: string, colorValueId: string, fileId = FILE_ID): string {
  return `products/${productId}/colors/${colorValueId}/${fileId}.jpg`;
}

describe('Products API Endpoints', () => {
  const app = createApp();
  let adminToken: string;
  let customerToken: string;
  let categoryId: string;
  let sizeMId: string;
  let sizeLId: string;
  let colorBlackId: string;
  let colorWhiteId: string;

  async function createProduct(overrides: Record<string, unknown> = {}) {
    return request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        name: 'Premium Cotton T-Shirt',
        description: 'Soft cotton tee',
        basePrice: '999.00',
        ...overrides,
      });
  }

  beforeEach(async () => {
    await prisma.productImage.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.productVariantAttribute.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.attributeValue.deleteMany({});
    await prisma.attribute.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});

    const adminRole = await prisma.role.create({ data: { name: 'admin' } });
    const customerRole = await prisma.role.create({ data: { name: 'customer' } });

    const adminUser = await prisma.user.create({
      data: {
        name: 'Admin User',
        mobileNumber: '9999999999',
        roleId: adminRole.id,
      },
    });

    const customerUser = await prisma.user.create({
      data: {
        name: 'Customer User',
        mobileNumber: '8888888888',
        roleId: customerRole.id,
      },
    });

    adminToken = jwt.sign({ id: adminUser.id }, appConfig.jwtSecret);
    customerToken = jwt.sign({ id: customerUser.id }, appConfig.jwtSecret);

    const category = await prisma.category.create({
      data: { name: 'T-Shirts', slug: 't-shirts' },
    });
    categoryId = category.id;

    const size = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
    const color = await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });

    const sizeM = await prisma.attributeValue.create({
      data: { attributeId: size.id, value: 'M', slug: 'm' },
    });
    const sizeL = await prisma.attributeValue.create({
      data: { attributeId: size.id, value: 'L', slug: 'l' },
    });
    const colorBlack = await prisma.attributeValue.create({
      data: { attributeId: color.id, value: 'Black', slug: 'black', colorCode: '#000000' },
    });
    const colorWhite = await prisma.attributeValue.create({
      data: { attributeId: color.id, value: 'White', slug: 'white', colorCode: '#FFFFFF' },
    });

    sizeMId = sizeM.id;
    sizeLId = sizeL.id;
    colorBlackId = colorBlack.id;
    colorWhiteId = colorWhite.id;

    vi.mocked(s3Service.createPresignedUploadUrl).mockImplementation((input) =>
      Promise.resolve({
        uploadUrl: 'https://test-bucket.s3.ap-south-1.amazonaws.com',
        method: 'POST',
        fields: {
          key: input.objectKey ?? 'generated-key',
          'Content-Type': input.contentType,
          Policy: 'policy',
          'X-Amz-Signature': 'signature',
        },
        imageKey: input.objectKey ?? 'generated-key',
        imageUrl: `https://test-bucket.s3.ap-south-1.amazonaws.com/${input.objectKey ?? 'generated-key'}`,
        expiresIn: PRODUCT_IMAGE.PRESIGNED_URL_EXPIRES_IN,
        maxSizeBytes: input.fileSize,
      }),
    );
    vi.mocked(s3Service.assertObjectExists).mockResolvedValue(undefined);
    vi.mocked(s3Service.deleteObjectIfExists).mockResolvedValue(undefined);
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
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
  });

  describe('Authentication and Authorization Protection', () => {
    it('should return 401 Unauthorized if Authorization header is missing', async () => {
      const response = await request(app).post('/api/v1/admin/products').send({
        categoryId,
        name: 'Premium Cotton T-Shirt',
        basePrice: '999.00',
      });

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('should return 403 Forbidden if user does not have Admin role', async () => {
      const response = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          categoryId,
          name: 'Premium Cotton T-Shirt',
          basePrice: '999.00',
        });

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
  });

  describe('POST /api/v1/admin/products', () => {
    it('should create a product and generate a slug from the name', async () => {
      const response = await createProduct();

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Product created successfully',
        data: {
          name: 'Premium Cotton T-Shirt',
          slug: 'premium-cotton-t-shirt',
          description: 'Soft cotton tee',
          basePrice: '999.00',
          status: 'ACTIVE',
          categoryId,
        },
      });
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.images).toEqual([]);
      expect(response.body.data.variants).toEqual([]);
    });

    it('should create a product with variants and inventory', async () => {
      const response = await createProduct({
        variants: [
          {
            sku: 'TSH-BLK-M-001',
            price: '999.00',
            compareAtPrice: '1299.00',
            attributeValueIds: [colorBlackId, sizeMId],
            inventory: { quantity: 10, reservedQuantity: 1 },
          },
        ],
      });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body.data.variants).toHaveLength(1);
      expect(response.body.data.variants[0]).toMatchObject({
        sku: 'TSH-BLK-M-001',
        price: '999.00',
        compareAtPrice: '1299.00',
        inventory: {
          quantity: 10,
          reservedQuantity: 1,
        },
      });
      expect(response.body.data.variants[0].attributes).toHaveLength(2);
    });

    it('should return 422 if the category does not exist', async () => {
      const response = await createProduct({
        categoryId: '00000000-0000-0000-0000-000000000000',
      });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body.message).toContain('Category with ID');
    });

    it('should suffix the slug when different names produce the same slug', async () => {
      await createProduct({ name: 'Classic Tee' });
      const response = await createProduct({ name: 'Classic Tee!' });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body.data.slug).toBe('classic-tee-2');
    });
  });

  describe('GET /api/v1/admin/products', () => {
    it('should return paginated products', async () => {
      await createProduct({ name: 'Alpha Tee' });
      await createProduct({ name: 'Beta Tee' });

      const response = await request(app)
        .get('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('should filter products by search, category, status, and SKU', async () => {
      const created = await createProduct({
        name: 'Searchable Hoodie',
        variants: [
          {
            sku: 'HOOD-BLK-M-001',
            price: '1499.00',
            attributeValueIds: [colorBlackId, sizeMId],
            inventory: { quantity: 4 },
          },
        ],
      });
      await createProduct({ name: 'Other Product', status: 'INACTIVE' });

      const searchResponse = await request(app)
        .get('/api/v1/admin/products')
        .query({ search: 'hoodie' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(searchResponse.body.data).toHaveLength(1);
      expect(searchResponse.body.data[0].name).toBe('Searchable Hoodie');

      const skuResponse = await request(app)
        .get('/api/v1/admin/products')
        .query({ sku: 'HOOD-BLK' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(skuResponse.body.data).toHaveLength(1);
      expect(skuResponse.body.data[0].id).toBe(created.body.data.id);

      const statusResponse = await request(app)
        .get('/api/v1/admin/products')
        .query({ status: 'INACTIVE' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statusResponse.body.data).toHaveLength(1);
      expect(statusResponse.body.data[0].name).toBe('Other Product');
    });
  });

  describe('GET /api/v1/admin/products/:id', () => {
    it('should retrieve a product with category, images, and variants', async () => {
      const created = await createProduct({
        variants: [
          {
            sku: 'TSH-WHT-L-001',
            price: '1099.00',
            attributeValueIds: [colorWhiteId, sizeLId],
            inventory: { quantity: 3 },
          },
        ],
      });

      const response = await request(app)
        .get(`/api/v1/admin/products/${created.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toMatchObject({
        id: created.body.data.id,
        category: { id: categoryId, name: 'T-Shirts' },
      });
      expect(response.body.data.variants[0].sku).toBe('TSH-WHT-L-001');
    });

    it('should return 404 if the product does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/v1/admin/products/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });

  describe('PATCH /api/v1/admin/products/:id', () => {
    it('should update product fields and regenerate the slug when the name changes', async () => {
      const created = await createProduct();

      const response = await request(app)
        .patch(`/api/v1/admin/products/${created.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Linen Shirt', basePrice: '1299.50', status: 'INACTIVE' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toMatchObject({
        name: 'Linen Shirt',
        slug: 'linen-shirt',
        basePrice: '1299.50',
        status: 'INACTIVE',
      });
    });
  });

  describe('DELETE /api/v1/admin/products/:id', () => {
    it('should deactivate a product instead of deleting it', async () => {
      const created = await createProduct();

      const response = await request(app)
        .delete(`/api/v1/admin/products/${created.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Product deactivated successfully',
        data: { status: 'INACTIVE' },
      });

      const dbProduct = await prisma.product.findUnique({
        where: { id: created.body.data.id },
      });
      expect(dbProduct).not.toBeNull();
      expect(dbProduct?.status).toBe('INACTIVE');
    });
  });

  describe('Variant management', () => {
    it('should create a variant with attributes and inventory', async () => {
      const product = await createProduct();

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'TSH-BLK-M-001',
          price: '999.00',
          attributeValueIds: [colorBlackId, sizeMId],
          inventory: { quantity: 8 },
        });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body.data).toMatchObject({
        sku: 'TSH-BLK-M-001',
        price: '999.00',
        inventory: { quantity: 8, reservedQuantity: 0 },
      });
      expect(response.body.data.attributes).toHaveLength(2);
    });

    it('should update a variant', async () => {
      const product = await createProduct({
        variants: [
          {
            sku: 'TSH-BLK-M-001',
            price: '999.00',
            attributeValueIds: [colorBlackId, sizeMId],
            inventory: { quantity: 2 },
          },
        ],
      });
      const variantId = product.body.data.variants[0].id as string;

      const response = await request(app)
        .patch(`/api/v1/admin/products/${product.body.data.id}/variants/${variantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: '1099.00', sku: 'TSH-BLK-M-002' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toMatchObject({
        sku: 'TSH-BLK-M-002',
        price: '1099.00',
      });
    });

    it('should return 409 for a duplicate SKU', async () => {
      const product = await createProduct({
        variants: [
          {
            sku: 'TSH-BLK-M-001',
            price: '999.00',
            attributeValueIds: [colorBlackId, sizeMId],
            inventory: { quantity: 2 },
          },
        ],
      });

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'tsh-blk-m-001',
          price: '1099.00',
          attributeValueIds: [colorWhiteId, sizeLId],
          inventory: { quantity: 1 },
        });

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body.message).toContain('already exists');
    });

    it('should reject multiple values for the same attribute', async () => {
      const product = await createProduct();

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'TSH-SIZE-DUP',
          price: '999.00',
          attributeValueIds: [sizeMId, sizeLId],
          inventory: { quantity: 1 },
        });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body.message).toBe(
        'A variant cannot contain multiple values for the same attribute',
      );
    });

    it('should reject a duplicate attribute combination', async () => {
      const product = await createProduct({
        variants: [
          {
            sku: 'TSH-BLK-M-001',
            price: '999.00',
            attributeValueIds: [colorBlackId, sizeMId],
            inventory: { quantity: 2 },
          },
        ],
      });

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'TSH-BLK-M-002',
          price: '1099.00',
          attributeValueIds: [sizeMId, colorBlackId],
          inventory: { quantity: 1 },
        });

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body.message).toBe(
        'A variant with this attribute combination already exists',
      );
    });

    it('should reject an invalid attribute value', async () => {
      const product = await createProduct();

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'TSH-INVALID',
          price: '999.00',
          attributeValueIds: ['00000000-0000-0000-0000-000000000000'],
          inventory: { quantity: 1 },
        });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body.message).toBe('One or more attribute values are invalid');
    });

    it('should return 403 for unauthorized variant mutation', async () => {
      const product = await createProduct();

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          sku: 'TSH-BLK-M-001',
          price: '999.00',
          attributeValueIds: [colorBlackId, sizeMId],
          inventory: { quantity: 1 },
        });

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
  });

  describe('Inventory management', () => {
    it('should create inventory with a variant and allow stock updates', async () => {
      const product = await createProduct({
        variants: [
          {
            sku: 'TSH-BLK-M-001',
            price: '999.00',
            attributeValueIds: [colorBlackId, sizeMId],
            inventory: { quantity: 5 },
          },
        ],
      });
      const variantId = product.body.data.variants[0].id as string;

      const setResponse = await request(app)
        .patch(`/api/v1/admin/products/${product.body.data.id}/variants/${variantId}/inventory`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 12 });

      expect(setResponse.status).toBe(HTTP_STATUS.OK);
      expect(setResponse.body.data.quantity).toBe(12);

      const adjustResponse = await request(app)
        .post(
          `/api/v1/admin/products/${product.body.data.id}/variants/${variantId}/inventory/adjust`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantityDelta: -2 });

      expect(adjustResponse.status).toBe(HTTP_STATUS.OK);
      expect(adjustResponse.body.data.quantity).toBe(10);
    });

    it('should reject negative quantity', async () => {
      const product = await createProduct({
        variants: [
          {
            sku: 'TSH-BLK-M-001',
            price: '999.00',
            attributeValueIds: [colorBlackId, sizeMId],
            inventory: { quantity: 5 },
          },
        ],
      });
      const variantId = product.body.data.variants[0].id as string;

      const response = await request(app)
        .patch(`/api/v1/admin/products/${product.body.data.id}/variants/${variantId}/inventory`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: -1 });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });

    it('should reject reserved quantity greater than quantity', async () => {
      const product = await createProduct({
        variants: [
          {
            sku: 'TSH-BLK-M-001',
            price: '999.00',
            attributeValueIds: [colorBlackId, sizeMId],
            inventory: { quantity: 5 },
          },
        ],
      });
      const variantId = product.body.data.variants[0].id as string;

      const response = await request(app)
        .patch(`/api/v1/admin/products/${product.body.data.id}/variants/${variantId}/inventory`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reservedQuantity: 6 });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });

    it('should allow only one inventory record per SKU', async () => {
      const product = await createProduct({
        variants: [
          {
            sku: 'TSH-BLK-M-001',
            price: '999.00',
            attributeValueIds: [colorBlackId, sizeMId],
            inventory: { quantity: 5 },
          },
        ],
      });
      const variantId = product.body.data.variants[0].id as string;

      const count = await prisma.inventory.count({ where: { variantId } });
      expect(count).toBe(1);

      await expect(
        prisma.inventory.create({
          data: { variantId, quantity: 1, reservedQuantity: 0 },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Product images', () => {
    it('should generate an S3 upload URL for a product image', async () => {
      const product = await createProduct();

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/images/upload-url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purpose: 'product_image',
          contentType: 'image/jpeg',
          fileSize: 1024,
        });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.message).toBe('Upload URL generated successfully');
      expect(s3Service.createPresignedUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image/jpeg',
          fileSize: 1024,
        }),
      );
    });

    it('should reject an unsupported MIME type', async () => {
      const product = await createProduct();

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/images/upload-url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purpose: 'product_image',
          contentType: 'application/pdf',
          fileSize: 1024,
        });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });

    it('should reject a file that exceeds the size limit', async () => {
      const product = await createProduct();

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/images/upload-url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purpose: 'product_image',
          contentType: 'image/png',
          fileSize: PRODUCT_IMAGE.MAX_BYTES + 1,
        });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });

    it('should create a generic product image', async () => {
      const product = await createProduct();
      const objectKey = genericImageKey(product.body.data.id as string);

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          objectKey,
          altText: 'Lifestyle photo',
          sortOrder: 0,
        });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(s3Service.assertObjectExists).toHaveBeenCalledWith(objectKey);
      expect(response.body.data).toMatchObject({
        objectKey,
        attributeValueId: null,
        isPrimary: true,
        altText: 'Lifestyle photo',
      });
    });

    it('should create a color-specific product image', async () => {
      const product = await createProduct();
      const objectKey = colorImageKey(product.body.data.id as string, colorBlackId);

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          objectKey,
          attributeValueId: colorBlackId,
          sortOrder: 1,
        });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body.data).toMatchObject({
        attributeValueId: colorBlackId,
        attributeValue: {
          id: colorBlackId,
          value: 'Black',
          attribute: { slug: 'color' },
        },
      });
    });

    it('should reject a non-color attribute value for an image', async () => {
      const product = await createProduct();
      const objectKey = genericImageKey(product.body.data.id as string);

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          objectKey,
          attributeValueId: sizeMId,
        });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body.message).toBe(
        'Product images can only be associated with Color attribute values',
      );
    });

    it('should delete a product image and its S3 object', async () => {
      const product = await createProduct();
      const objectKey = genericImageKey(product.body.data.id as string);
      const created = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ objectKey });

      const response = await request(app)
        .delete(`/api/v1/admin/products/${product.body.data.id}/images/${created.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(s3Service.deleteObjectIfExists).toHaveBeenCalledWith(objectKey);
    });

    it('should replace a product image and delete the previous S3 object after the database update', async () => {
      const product = await createProduct();
      const productId = product.body.data.id as string;
      const originalKey = genericImageKey(productId);
      const replacementKey = genericImageKey(productId, REPLACEMENT_FILE_ID);

      const created = await request(app)
        .post(`/api/v1/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ objectKey: originalKey });

      const response = await request(app)
        .patch(`/api/v1/admin/products/${productId}/images/${created.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ objectKey: replacementKey });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.objectKey).toBe(replacementKey);
      expect(s3Service.deleteObjectIfExists).toHaveBeenCalledWith(originalKey);
    });

    it('should keep at most one primary image per product', async () => {
      const product = await createProduct();
      const productId = product.body.data.id as string;

      const first = await request(app)
        .post(`/api/v1/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ objectKey: genericImageKey(productId), isPrimary: true });

      const second = await request(app)
        .post(`/api/v1/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          objectKey: genericImageKey(productId, REPLACEMENT_FILE_ID),
          isPrimary: true,
        });

      expect(first.status).toBe(HTTP_STATUS.CREATED);
      expect(second.status).toBe(HTTP_STATUS.CREATED);
      expect(second.body.data.isPrimary).toBe(true);

      const primaryCount = await prisma.productImage.count({
        where: { productId, isPrimary: true },
      });
      expect(primaryCount).toBe(1);

      const original = await prisma.productImage.findUnique({
        where: { id: first.body.data.id as string },
      });
      expect(original?.isPrimary).toBe(false);
    });

    it('should reject image operations that target the wrong product', async () => {
      const product = await createProduct({ name: 'First Product' });
      const other = await createProduct({ name: 'Second Product' });
      const objectKey = genericImageKey(product.body.data.id as string);

      const created = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ objectKey });

      const response = await request(app)
        .delete(`/api/v1/admin/products/${other.body.data.id}/images/${created.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });

  describe('Related catalog constraints', () => {
    it('should reject deleting a category that still has products', async () => {
      await createProduct();

      const response = await request(app)
        .delete(`/api/v1/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
    });
  });
});
