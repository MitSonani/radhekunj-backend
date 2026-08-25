/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { appConfig } from '../../config/index.js';

describe('Attributes API Endpoints', () => {
  const app = createApp();
  let adminToken: string;
  let customerToken: string;

  beforeEach(async () => {
    await prisma.attributeValue.deleteMany({});
    await prisma.attribute.deleteMany({});
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
  });

  afterAll(async () => {
    await prisma.attributeValue.deleteMany({});
    await prisma.attribute.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
  });

  describe('Authentication and Authorization Protection', () => {
    it('should return 401 Unauthorized if Authorization header is missing', async () => {
      const response = await request(app).post('/api/v1/admin/attributes').send({ name: 'Size' });

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Access token is missing or invalid',
      });
    });

    it('should return 403 Forbidden if user does not have Admin role', async () => {
      const response = await request(app)
        .post('/api/v1/admin/attributes')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: 'Size' });

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Forbidden: You do not have permission to access this resource',
      });
    });
  });

  describe('POST /api/v1/admin/attributes', () => {
    it('should create an attribute and generate a slug from the name', async () => {
      const response = await request(app)
        .post('/api/v1/admin/attributes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Size' });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Attribute created successfully',
        data: {
          name: 'Size',
          slug: 'size',
          valueCount: 0,
        },
      });
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
    });

    it('should return 409 Conflict if attribute name already exists', async () => {
      await request(app)
        .post('/api/v1/admin/attributes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Size' });

      const response = await request(app)
        .post('/api/v1/admin/attributes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'size' });

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Attribute name "size" already exists',
      });
    });

    it('should return 422 Unprocessable Entity if name is missing or empty', async () => {
      const response = await request(app)
        .post('/api/v1/admin/attributes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '   ' });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Validation failed',
      });
    });
  });

  describe('GET /api/v1/admin/attributes', () => {
    it('should return paginated attributes with value counts', async () => {
      const size = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
      await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });
      await prisma.attributeValue.create({
        data: { attributeId: size.id, value: 'M', slug: 'm' },
      });

      const response = await request(app)
        .get('/api/v1/admin/attributes')
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

      const sizeRow = response.body.data.find((item: { slug: string }) => item.slug === 'size');
      expect(sizeRow.valueCount).toBe(1);
    });

    it('should filter attributes by search term', async () => {
      await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
      await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });

      const response = await request(app)
        .get('/api/v1/admin/attributes')
        .query({ search: 'col' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Color');
    });
  });

  describe('GET /api/v1/admin/attributes/:id', () => {
    it('should retrieve an attribute by ID', async () => {
      const attribute = await prisma.attribute.create({
        data: { name: 'Material', slug: 'material' },
      });

      const response = await request(app)
        .get(`/api/v1/admin/attributes/${attribute.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: attribute.id,
          name: 'Material',
          slug: 'material',
          valueCount: 0,
        },
      });
    });

    it('should return 404 Not Found if attribute ID does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/v1/admin/attributes/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(response.body).toMatchObject({
        success: false,
        message: `Attribute with ID "${fakeId}" not found`,
      });
    });
  });

  describe('PATCH /api/v1/admin/attributes/:id', () => {
    it('should update the name and regenerate the slug', async () => {
      const attribute = await prisma.attribute.create({
        data: { name: 'Old Name', slug: 'old-name' },
      });

      const response = await request(app)
        .patch(`/api/v1/admin/attributes/${attribute.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Attribute updated successfully',
        data: {
          id: attribute.id,
          name: 'New Name',
          slug: 'new-name',
        },
      });
    });
  });

  describe('DELETE /api/v1/admin/attributes/:id', () => {
    it('should delete an attribute with no values', async () => {
      const attribute = await prisma.attribute.create({ data: { name: 'Fit', slug: 'fit' } });

      const response = await request(app)
        .delete(`/api/v1/admin/attributes/${attribute.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Attribute deleted successfully',
      });

      const dbAttribute = await prisma.attribute.findUnique({ where: { id: attribute.id } });
      expect(dbAttribute).toBeNull();
    });

    it('should return 409 Conflict if the attribute still has values', async () => {
      const attribute = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
      await prisma.attributeValue.create({
        data: { attributeId: attribute.id, value: 'M', slug: 'm' },
      });

      const response = await request(app)
        .delete(`/api/v1/admin/attributes/${attribute.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body).toMatchObject({
        success: false,
        message: 'This attribute has values and cannot be deleted. Remove its values first.',
      });

      const dbAttribute = await prisma.attribute.findUnique({ where: { id: attribute.id } });
      expect(dbAttribute).not.toBeNull();
    });
  });

  describe('POST /api/v1/admin/attributes/:id/values', () => {
    it('should create a value and generate a slug', async () => {
      const attribute = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });

      const response = await request(app)
        .post(`/api/v1/admin/attributes/${attribute.id}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'XL' });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Attribute value created successfully',
        data: {
          attributeId: attribute.id,
          value: 'XL',
          slug: 'xl',
          colorCode: null,
        },
      });
    });

    it('should store a color code when provided', async () => {
      const attribute = await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });

      const response = await request(app)
        .post(`/api/v1/admin/attributes/${attribute.id}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Green', colorCode: '#164a35' });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body.data.colorCode).toBe('#164A35');
    });

    it('should return 409 Conflict if the value already exists on the attribute', async () => {
      const attribute = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
      await prisma.attributeValue.create({
        data: { attributeId: attribute.id, value: 'M', slug: 'm' },
      });

      const response = await request(app)
        .post(`/api/v1/admin/attributes/${attribute.id}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'm' });

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Attribute value "m" already exists',
      });
    });

    it('should return 422 for an invalid color code', async () => {
      const attribute = await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });

      const response = await request(app)
        .post(`/api/v1/admin/attributes/${attribute.id}/values`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Green', colorCode: 'green' });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Validation failed',
      });
    });
  });

  describe('GET /api/v1/admin/attributes/:id/values', () => {
    it('should return paginated values for an attribute', async () => {
      const attribute = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
      await prisma.attributeValue.create({
        data: { attributeId: attribute.id, value: 'S', slug: 's' },
      });
      await prisma.attributeValue.create({
        data: { attributeId: attribute.id, value: 'M', slug: 'm' },
      });

      const response = await request(app)
        .get(`/api/v1/admin/attributes/${attribute.id}/values`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        total: 2,
        totalPages: 1,
      });
    });
  });

  describe('PATCH /api/v1/admin/attributes/:id/values/:valueId', () => {
    it('should update a value and its color code', async () => {
      const attribute = await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });
      const value = await prisma.attributeValue.create({
        data: {
          attributeId: attribute.id,
          value: 'Black',
          slug: 'black',
          colorCode: '#000000',
        },
      });

      const response = await request(app)
        .patch(`/api/v1/admin/attributes/${attribute.id}/values/${value.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'Charcoal', colorCode: '#36454f' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: value.id,
          value: 'Charcoal',
          slug: 'charcoal',
          colorCode: '#36454F',
        },
      });
    });
  });

  describe('DELETE /api/v1/admin/attributes/:id/values/:valueId', () => {
    it('should delete an attribute value', async () => {
      const attribute = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
      const value = await prisma.attributeValue.create({
        data: { attributeId: attribute.id, value: 'XXL', slug: 'xxl' },
      });

      const response = await request(app)
        .delete(`/api/v1/admin/attributes/${attribute.id}/values/${value.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Attribute value deleted successfully',
      });

      const dbValue = await prisma.attributeValue.findUnique({ where: { id: value.id } });
      expect(dbValue).toBeNull();
    });

    it('should return 404 if the value does not belong to the attribute', async () => {
      const size = await prisma.attribute.create({ data: { name: 'Size', slug: 'size' } });
      const color = await prisma.attribute.create({ data: { name: 'Color', slug: 'color' } });
      const value = await prisma.attributeValue.create({
        data: { attributeId: color.id, value: 'Red', slug: 'red' },
      });

      const response = await request(app)
        .delete(`/api/v1/admin/attributes/${size.id}/values/${value.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });
});
