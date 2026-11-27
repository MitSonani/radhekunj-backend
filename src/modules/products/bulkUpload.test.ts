/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { appConfig } from '../../config/index.js';
import { HTTP_STATUS, ROLES } from '../../shared/constants/index.js';
import { getBulkUploadTemplateCsv, processBulkUpload } from './bulkUpload.service.js';

describe('Bulk Upload Products', () => {
  const app = createApp();
  const secret = 'test-jwt-secret';

  beforeEach(() => {
    appConfig.jwtSecret = secret;
    (vi.spyOn(prisma.user, 'findUnique') as any).mockImplementation(async (args: any) => {
      const id = args?.where?.id;
      if (id === '11111111-1111-1111-1111-111111111111') {
        return {
          id,
          name: 'Admin User',
          isActive: true,
          role: { id: 'admin-role-id', name: ROLES.ADMIN },
        };
      }
      if (id === '22222222-2222-2222-2222-222222222222') {
        return {
          id,
          name: 'Customer User',
          isActive: true,
          role: { id: 'customer-role-id', name: ROLES.CUSTOMER },
        };
      }
      return null;
    });
  });

  const adminToken = jwt.sign(
    {
      id: '11111111-1111-1111-1111-111111111111',
      mobileNumber: '9999999999',
      role: ROLES.ADMIN,
    },
    secret,
    { expiresIn: '1h' },
  );

  const customerToken = jwt.sign(
    {
      id: '22222222-2222-2222-2222-222222222222',
      mobileNumber: '8888888888',
      role: ROLES.CUSTOMER,
    },
    secret,
    { expiresIn: '1h' },
  );

  describe('Template generation', () => {
    it('should generate a valid CSV template string with required headers', () => {
      const csv = getBulkUploadTemplateCsv();
      expect(csv).toContain('handle,category_name,product_name');
      expect(csv).toContain('sku,variant_price,compare_at_price');
      expect(csv).toContain('stock_quantity,low_stock_threshold');
    });

    it('should allow admin to download template via API', async () => {
      const res = await request(app)
        .get('/api/v1/admin/products/bulk-upload/template')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('handle,category_name,product_name');
    });

    it('should reject non-admin users from downloading template', async () => {
      const res = await request(app)
        .get('/api/v1/admin/products/bulk-upload/template')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
  });

  describe('Validation logic in processBulkUpload', () => {
    it('should catch rows with missing or invalid SKU', async () => {
      const result = await processBulkUpload([
        {
          product_name: 'Test Product',
          category_name: 'Men',
          sku: '',
          variant_price: '100.00',
        },
      ]);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.error).toContain('SKU is required');
    });

    it('should catch invalid price format', async () => {
      const result = await processBulkUpload([
        {
          product_name: 'Test Product',
          category_name: 'Men',
          sku: 'VALID-SKU-001',
          variant_price: 'invalid_price',
        },
      ]);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.error).toContain('Invalid variant price');
    });
  });

  describe('API endpoint validation', () => {
    it('should return error if no file or rows provided', async () => {
      const res = await request(app)
        .post('/api/v1/admin/products/bulk-upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
    });

    it('should accept CSV file upload via multipart/form-data', async () => {
      const csvBuffer = Buffer.from(
        'handle,category_name,product_name,base_price,sku,variant_price,stock_quantity\n' +
          'invalid-item,Men,Invalid Item,invalid_price,SKU-BAD,invalid_price,10\n',
      );

      const res = await request(app)
        .post('/api/v1/admin/products/bulk-upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csvBuffer, 'products.csv');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(false);
      expect(res.body.data.errors.length).toBeGreaterThan(0);
    });
  });
});
