/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { CATEGORY_IMAGE, HTTP_STATUS } from '../../shared/constants/index.js';
import { appConfig } from '../../config/index.js';
import * as s3Service from '../../shared/services/s3.js';

const SAMPLE_IMAGE_KEY =
  'categories/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg';
const REPLACEMENT_IMAGE_KEY =
  'categories/cccccccc-cccc-cccc-cccc-cccccccccccc/dddddddd-dddd-dddd-dddd-dddddddddddd.png';

vi.mock('../../shared/services/s3.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/services/s3.js')>();

  return {
    ...actual,
    createPresignedUploadUrl: vi.fn(),
    assertObjectExists: vi.fn(),
    deleteObjectIfExists: vi.fn(),
  };
});

describe('Categories API Endpoints', () => {
  const app = createApp();
  let adminToken: string;
  let customerToken: string;

  beforeEach(async () => {
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

    vi.mocked(s3Service.createPresignedUploadUrl).mockResolvedValue({
      uploadUrl: 'https://test-bucket.s3.ap-south-1.amazonaws.com',
      method: 'POST',
      fields: {
        key: SAMPLE_IMAGE_KEY,
        'Content-Type': 'image/jpeg',
        Policy: 'policy',
        'X-Amz-Signature': 'signature',
      },
      imageKey: SAMPLE_IMAGE_KEY,
      imageUrl: `https://test-bucket.s3.ap-south-1.amazonaws.com/${SAMPLE_IMAGE_KEY}`,
      expiresIn: CATEGORY_IMAGE.PRESIGNED_URL_EXPIRES_IN,
      maxSizeBytes: 1024,
    });
    vi.mocked(s3Service.assertObjectExists).mockResolvedValue(undefined);
    vi.mocked(s3Service.deleteObjectIfExists).mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
  });

  describe('Authentication and Authorization Protection', () => {
    it('should return 401 Unauthorized if Authorization header is missing', async () => {
      const response = await request(app).post('/api/v1/admin/categories').send({
        name: "Men's Shoes",
      });

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Access token is missing or invalid',
      });
    });

    it('should return 403 Forbidden if user does not have Admin role', async () => {
      const response = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: "Men's Shoes" });

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Forbidden: You do not have permission to access this resource',
      });
    });
  });

  describe('POST /api/v1/admin/categories', () => {
    it('should create a category and generate a slug from the name', async () => {
      const response = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: "Men's Shoes",
          description: 'Footwear for men',
        });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Category created successfully',
        data: {
          name: "Men's Shoes",
          slug: 'mens-shoes',
          description: 'Footwear for men',
          status: 'ACTIVE',
          imageKey: null,
          imageUrl: null,
        },
      });
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
    });

    it('should return 409 Conflict if category name already exists', async () => {
      await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Footwear' });

      const response = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'footwear' });

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Category name "footwear" already exists',
      });
    });

    it('should suffix the slug when different names produce the same slug', async () => {
      await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Foo' });

      const response = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Foo!' });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body.data.slug).toBe('foo-2');
    });

    it('should return 422 Unprocessable Entity if name is missing or empty', async () => {
      const response = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '   ' });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Validation failed',
      });
    });
  });

  describe('GET /api/v1/admin/categories', () => {
    it('should return paginated categories', async () => {
      await prisma.category.create({ data: { name: 'Bags', slug: 'bags' } });
      await prisma.category.create({ data: { name: 'Shoes', slug: 'shoes' } });

      const response = await request(app)
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`);

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

    it('should filter categories by search term', async () => {
      await prisma.category.create({ data: { name: "Men's Shoes", slug: 'mens-shoes' } });
      await prisma.category.create({ data: { name: "Women's Bags", slug: 'womens-bags' } });

      const response = await request(app)
        .get('/api/v1/admin/categories')
        .query({ search: 'shoes' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe("Men's Shoes");
    });
  });

  describe('GET /api/v1/admin/categories/:id', () => {
    it('should retrieve a category by ID', async () => {
      const category = await prisma.category.create({
        data: { name: 'Accessories', slug: 'accessories' },
      });

      const response = await request(app)
        .get(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: category.id,
          name: 'Accessories',
          slug: 'accessories',
        },
      });
    });

    it('should return 404 Not Found if category ID does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/v1/admin/categories/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(response.body).toMatchObject({
        success: false,
        message: `Category with ID "${fakeId}" not found`,
      });
    });

    it('should return 422 Unprocessable if ID is not a valid UUID', async () => {
      const response = await request(app)
        .get('/api/v1/admin/categories/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Validation failed',
      });
    });
  });

  describe('PATCH /api/v1/admin/categories/:id', () => {
    it('should update category fields and regenerate the slug when the name changes', async () => {
      const category = await prisma.category.create({
        data: { name: 'Old Name', slug: 'old-name' },
      });

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name', status: 'INACTIVE' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Category updated successfully',
        data: {
          id: category.id,
          name: 'New Name',
          slug: 'new-name',
          status: 'INACTIVE',
        },
      });
    });

    it('should attach an image after verifying the S3 object', async () => {
      const category = await prisma.category.create({
        data: { name: 'Watches', slug: 'watches' },
      });

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageKey: SAMPLE_IMAGE_KEY });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(s3Service.assertObjectExists).toHaveBeenCalledWith(SAMPLE_IMAGE_KEY);
      expect(response.body.data.imageKey).toBe(SAMPLE_IMAGE_KEY);
      expect(response.body.data.imageUrl).toContain(SAMPLE_IMAGE_KEY);
    });

    it('should replace an image and delete the previous S3 object after the database update', async () => {
      const category = await prisma.category.create({
        data: {
          name: 'Jewelry',
          slug: 'jewelry',
          imageKey: SAMPLE_IMAGE_KEY,
          imageUrl: `https://example.com/${SAMPLE_IMAGE_KEY}`,
        },
      });

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageKey: REPLACEMENT_IMAGE_KEY });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.imageKey).toBe(REPLACEMENT_IMAGE_KEY);
      expect(s3Service.deleteObjectIfExists).toHaveBeenCalledWith(SAMPLE_IMAGE_KEY);
    });

    it('should return 409 Conflict if the new name is already taken', async () => {
      const category = await prisma.category.create({
        data: { name: 'Hats', slug: 'hats' },
      });
      await prisma.category.create({ data: { name: 'Belts', slug: 'belts' } });

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Belts' });

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
    });
  });

  describe('DELETE /api/v1/admin/categories/:id', () => {
    it('should delete a category and its S3 image', async () => {
      const category = await prisma.category.create({
        data: {
          name: 'Seasonal',
          slug: 'seasonal',
          imageKey: SAMPLE_IMAGE_KEY,
          imageUrl: `https://example.com/${SAMPLE_IMAGE_KEY}`,
        },
      });

      const response = await request(app)
        .delete(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Category deleted successfully',
      });
      expect(s3Service.deleteObjectIfExists).toHaveBeenCalledWith(SAMPLE_IMAGE_KEY);

      const dbCategory = await prisma.category.findUnique({ where: { id: category.id } });
      expect(dbCategory).toBeNull();
    });

    it('should return 404 Not Found if category ID does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .delete(`/api/v1/admin/categories/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });

  describe('POST /api/v1/admin/categories/image/upload-url', () => {
    it('should generate a presigned upload URL for an admin', async () => {
      const response = await request(app)
        .post('/api/v1/admin/categories/image/upload-url')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purpose: 'category_image',
          contentType: 'image/jpeg',
          fileSize: 1024,
        });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Upload URL generated successfully',
        data: {
          uploadUrl: 'https://test-bucket.s3.ap-south-1.amazonaws.com',
          method: 'POST',
          imageKey: SAMPLE_IMAGE_KEY,
        },
      });
      expect(s3Service.createPresignedUploadUrl).toHaveBeenCalledWith({
        contentType: 'image/jpeg',
        fileSize: 1024,
      });
    });

    it('should return 403 Forbidden for non-admin users', async () => {
      const response = await request(app)
        .post('/api/v1/admin/categories/image/upload-url')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          purpose: 'category_image',
          contentType: 'image/jpeg',
          fileSize: 1024,
        });

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    });

    it('should return 422 for an unsupported image type', async () => {
      const response = await request(app)
        .post('/api/v1/admin/categories/image/upload-url')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purpose: 'category_image',
          contentType: 'application/pdf',
          fileSize: 1024,
        });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Validation failed',
      });
    });

    it('should return 422 when the upload request is invalid', async () => {
      const response = await request(app)
        .post('/api/v1/admin/categories/image/upload-url')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purpose: 'product_image',
          contentType: 'image/jpeg',
          fileSize: CATEGORY_IMAGE.MAX_BYTES + 1,
        });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });

    it('should return 422 when the image is too large', async () => {
      const response = await request(app)
        .post('/api/v1/admin/categories/image/upload-url')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purpose: 'category_image',
          contentType: 'image/png',
          fileSize: CATEGORY_IMAGE.MAX_BYTES + 1,
        });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });
  });
});
