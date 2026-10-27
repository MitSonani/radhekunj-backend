/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    deleteObjectIfExists: vi.fn(),
  };
});

describe('Banners API Endpoints', () => {
  const app = createApp();
  let adminToken: string;
  let customerToken: string;

  beforeEach(async () => {
    await prisma.banner.deleteMany({});
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
      fields: { key: 'test-key' },
      imageKey: 'banners/desktop-00000000-0000-0000-0000-000000000000.webp',
      imageUrl: 'https://test-bucket.s3.ap-south-1.amazonaws.com/banners/test.webp',
      expiresIn: 300,
      maxSizeBytes: 10 * 1024 * 1024,
    });
  });

  describe('GET /api/v1/banners (Public)', () => {
    it('returns only active banners ordered by sortOrder asc', async () => {
      await prisma.banner.createMany({
        data: [
          {
            title: 'Second Banner',
            desktopImageUrl: 'https://cdn.example.com/desktop-2.jpg',
            altText: 'Second Banner',
            isActive: true,
            sortOrder: 2,
          },
          {
            title: 'First Banner',
            desktopImageUrl: 'https://cdn.example.com/desktop-1.jpg',
            altText: 'First Banner',
            isActive: true,
            sortOrder: 1,
          },
          {
            title: 'Inactive Banner',
            desktopImageUrl: 'https://cdn.example.com/desktop-inactive.jpg',
            altText: 'Inactive Banner',
            isActive: false,
            sortOrder: 0,
          },
        ],
      });

      const res = await request(app).get('/api/v1/banners');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].title).toBe('First Banner');
      expect(res.body.data[1].title).toBe('Second Banner');
    });

    it('returns empty array when no active banners exist', async () => {
      const res = await request(app).get('/api/v1/banners');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('Admin Authorization', () => {
    it('rejects unauthenticated requests to /api/v1/admin/banners', async () => {
      const res = await request(app).get('/api/v1/admin/banners');
      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('rejects customer requests to /api/v1/admin/banners', async () => {
      const res = await request(app)
        .get('/api/v1/admin/banners')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
  });

  describe('Admin CRUD Operations', () => {
    it('creates a new banner with full responsive images and returns 201', async () => {
      const payload = {
        title: 'Spring Collection 2026',
        subtitle: 'Artisan hand-woven apparel',
        badgeText: 'New Season',
        ctaLabel: 'Shop Now',
        ctaLink: '/collections/spring',
        desktopImageUrl: 'https://cdn.example.com/spring-desktop.webp',
        tabletImageUrl: 'https://cdn.example.com/spring-tablet.webp',
        mobileImageUrl: 'https://cdn.example.com/spring-mobile.webp',
        desktopImageKey: 'banners/desktop-11111111-1111-1111-1111-111111111111.webp',
        altText: 'Spring Collection model in natural linen',
        textAlignment: 'center',
        isActive: true,
        sortOrder: 1,
      };

      const res = await request(app)
        .post('/api/v1/admin/banners')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.title).toBe(payload.title);
      expect(res.body.data.tabletImageUrl).toBe(payload.tabletImageUrl);
      expect(res.body.data.textAlignment).toBe('center');

      // Verify in DB
      const dbBanner = await prisma.banner.findUnique({ where: { id: res.body.data.id } });
      expect(dbBanner).not.toBeNull();
      expect(dbBanner?.title).toBe(payload.title);
    });

    it('fails when required fields are missing on creation', async () => {
      const invalidPayload = {
        title: '',
        desktopImageUrl: '',
      };

      const res = await request(app)
        .post('/api/v1/admin/banners')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidPayload);

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });

    it('lists all banners for admin including inactive ones', async () => {
      await prisma.banner.createMany({
        data: [
          {
            title: 'Active Banner',
            desktopImageUrl: 'https://cdn.example.com/1.jpg',
            altText: 'Active',
            isActive: true,
            sortOrder: 1,
          },
          {
            title: 'Inactive Banner',
            desktopImageUrl: 'https://cdn.example.com/2.jpg',
            altText: 'Inactive',
            isActive: false,
            sortOrder: 2,
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/admin/banners')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('retrieves and updates a banner by ID', async () => {
      const created = await prisma.banner.create({
        data: {
          title: 'Initial Title',
          desktopImageUrl: 'https://cdn.example.com/img.jpg',
          altText: 'Initial Alt',
          isActive: false,
          sortOrder: 0,
        },
      });

      // Update
      const updateRes = await request(app)
        .put(`/api/v1/admin/banners/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Updated Title',
          isActive: true,
          sortOrder: 5,
        });

      expect(updateRes.status).toBe(HTTP_STATUS.OK);
      expect(updateRes.body.data.title).toBe('Updated Title');
      expect(updateRes.body.data.isActive).toBe(true);
      expect(updateRes.body.data.sortOrder).toBe(5);

      // Verify GET by ID
      const getRes = await request(app)
        .get(`/api/v1/admin/banners/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.status).toBe(HTTP_STATUS.OK);
      expect(getRes.body.data.title).toBe('Updated Title');
    });

    it('deletes a banner and returns 200', async () => {
      const banner = await prisma.banner.create({
        data: {
          title: 'To Delete',
          desktopImageUrl: 'https://cdn.example.com/del.jpg',
          altText: 'Delete alt',
          desktopImageKey: 'banners/desktop-00000000-0000-0000-0000-000000000000.webp',
        },
      });

      const delRes = await request(app)
        .delete(`/api/v1/admin/banners/${banner.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

            expect(delRes.status).toBe(HTTP_STATUS.OK);

      const findRes = await request(app)
        .get(`/api/v1/admin/banners/${banner.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(findRes.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('generates an S3 presigned upload URL for banner images', async () => {
      const res = await request(app)
        .post('/api/v1/admin/banners/upload-url')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          device: 'desktop',
          contentType: 'image/webp',
          fileSize: 2 * 1024 * 1024,
        });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.uploadUrl).toBeDefined();
    });
  });
});
