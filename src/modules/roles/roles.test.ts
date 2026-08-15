/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { appConfig } from '../../config/index.js';

describe('Roles API Endpoints', () => {
  const app = createApp();
  let adminToken: string;
  let customerToken: string;
  let adminRole: { id: string; name: string };
  let customerRole: { id: string; name: string };

  // Database cleanup and seeding before each test to guarantee isolation
  beforeEach(async () => {
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});

    // Seed roles
    adminRole = await prisma.role.create({ data: { name: 'Admin' } });
    customerRole = await prisma.role.create({ data: { name: 'Customer' } });

    // Seed users
    const adminUser = await prisma.user.create({
      data: {
        name: 'Admin User',
        roleId: adminRole.id,
      },
    });

    const customerUser = await prisma.user.create({
      data: {
        name: 'Customer User',
        roleId: customerRole.id,
      },
    });

    // Generate tokens
    adminToken = jwt.sign({ id: adminUser.id }, appConfig.jwtSecret);
    customerToken = jwt.sign({ id: customerUser.id }, appConfig.jwtSecret);
  });

  // Cleanup after all tests finish
  afterAll(async () => {
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
  });

  describe('Authentication and Authorization Protection', () => {
    it('should return 401 Unauthorized if Authorization header is missing', async () => {
      const response = await request(app)
        .post('/api/v1/admin/roles')
        .send({ name: 'Manager' });

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Access token is missing or invalid',
      });
    });

    it('should return 401 Unauthorized if Authorization token is invalid', async () => {
      const response = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', 'Bearer invalid-token')
        .send({ name: 'Manager' });

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Access token is invalid or expired',
      });
    });

    it('should return 403 Forbidden if user does not have Admin role', async () => {
      const response = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: 'Manager' });

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Forbidden: You do not have permission to access this resource',
      });
    });
  });

  describe('POST /api/v1/admin/roles', () => {
    it('should successfully create a new role with a valid name as an Admin', async () => {
      const response = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Manager' });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Role created successfully',
        data: {
          name: 'Manager',
        },
      });
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
    });

    it('should return 409 Conflict if role name already exists', async () => {
      await prisma.role.create({ data: { name: 'Manager' } });

      const response = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Manager' });

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Role name "Manager" already exists',
      });
    });

    it('should return 422 Unprocessable Entity if name is missing or empty', async () => {
      const response = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '   ' });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Validation failed',
      });
    });
  });

  describe('GET /api/v1/admin/roles', () => {
    it('should return all roles ordered by creation date', async () => {
      // Admin and Customer roles are already created in beforeEach
      const response = await request(app)
        .get('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
      });
      // We expect at least the 2 seeded roles: Admin and Customer
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data[0]).toHaveProperty('name');
    });
  });

  describe('GET /api/v1/admin/roles/:id', () => {
    it('should retrieve a role by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/admin/roles/${adminRole.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: adminRole.id,
          name: 'Admin',
        },
      });
    });

    it('should return 404 Not Found if role ID does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/v1/admin/roles/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(response.body).toMatchObject({
        success: false,
        message: `Role with ID "${fakeId}" not found`,
      });
    });

    it('should return 422 Unprocessable if ID is not a valid UUID', async () => {
      const response = await request(app)
        .get('/api/v1/admin/roles/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Validation failed',
      });
    });
  });

  describe('PATCH /api/v1/admin/roles/:id', () => {
    it('should update a role name successfully', async () => {
      const role = await prisma.role.create({ data: { name: 'Support' } });

      const response = await request(app)
        .patch(`/api/v1/admin/roles/${role.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Super Support' });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Role updated successfully',
        data: {
          id: role.id,
          name: 'Super Support',
        },
      });
    });

    it('should return 409 Conflict if new name is already taken by another role', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/roles/${adminRole.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: customerRole.name });

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body).toMatchObject({
        success: false,
        message: `Role name "${customerRole.name}" already exists`,
      });
    });

    it('should return 404 Not Found if updating a non-existent role', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .patch(`/api/v1/admin/roles/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name' });

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });

  describe('DELETE /api/v1/admin/roles/:id', () => {
    it('should delete a role successfully', async () => {
      const role = await prisma.role.create({ data: { name: 'Tester' } });

      const response = await request(app)
        .delete(`/api/v1/admin/roles/${role.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Role deleted successfully',
      });

      const dbRole = await prisma.role.findUnique({ where: { id: role.id } });
      expect(dbRole).toBeNull();
    });

    it('should return 400 Bad Request and prevent deletion if role is assigned to users', async () => {
      const role = await prisma.role.create({ data: { name: 'Specialist' } });
      await prisma.user.create({
        data: {
          name: 'Kunjesh',
          roleId: role.id,
        },
      });

      const response = await request(app)
        .delete(`/api/v1/admin/roles/${role.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Cannot delete role because it is assigned to 1 user(s)',
      });

      const dbRole = await prisma.role.findUnique({ where: { id: role.id } });
      expect(dbRole).toBeDefined();
    });

    it('should return 404 Not Found if role ID does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .delete(`/api/v1/admin/roles/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });
});
