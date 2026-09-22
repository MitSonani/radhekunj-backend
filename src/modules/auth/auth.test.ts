/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { _clearOtpSendLocksForTest } from '../../shared/utils/otpStore.js';

describe('Auth API Endpoints (OTP Flow)', () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await _clearOtpSendLocksForTest();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
  });

  describe('POST /api/v1/auth/otp/send', () => {
    it('should successfully send an OTP when a valid mobileNumber is provided', async () => {
      const response = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({
          countryCode: '+91',
          mobileNumber: '9876543210',
        });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'OTP sent successfully',
      });
      // OTP is returned in response in test environment
      expect(response.body.data).toHaveProperty('otp');
      expect(response.body.data.otp).toHaveLength(6);
    });

    it('should return 422 Unprocessable if mobileNumber is missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ countryCode: '+91' });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Validation failed',
      });
    });
  });

  describe('POST /api/v1/auth/otp/verify', () => {
    it('should successfully login/signup and return a JWT on correct OTP', async () => {
      // 1. Send OTP
      const sendResponse = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({
          countryCode: '+91',
          mobileNumber: '9876543210',
        });

      const otp = sendResponse.body.data.otp as string;

      // 2. Verify OTP
      const verifyResponse = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          countryCode: '+91',
          mobileNumber: '9876543210',
          otp,
          name: 'Kunjesh Sonani',
        });

      expect(verifyResponse.status).toBe(HTTP_STATUS.OK);
      expect(verifyResponse.body).toMatchObject({
        success: true,
        message: 'Authentication successful',
        data: {
          user: {
            name: 'Kunjesh Sonani',
            role: {
              name: 'customer',
            },
          },
        },
      });
      expect(verifyResponse.body.data).toHaveProperty('token');
      expect(verifyResponse.body.data.token).toBeDefined();

      // Verify user was created in the database
      const dbUser = await prisma.user.findFirst({
        where: { mobileNumber: '9876543210' },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.name).toBe('Kunjesh Sonani');
    });

    it('should return 400 Bad Request on incorrect OTP', async () => {
      // 1. Send OTP
      await request(app)
        .post('/api/v1/auth/otp/send')
        .send({
          countryCode: '+91',
          mobileNumber: '9876543210',
        });

      // 2. Verify with wrong OTP
      const verifyResponse = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          countryCode: '+91',
          mobileNumber: '9876543210',
          otp: '000000', // incorrect
        });

      expect(verifyResponse.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(verifyResponse.body).toMatchObject({
        success: false,
        message: 'Invalid or expired OTP',
      });
    });

    it('should return 400 Bad Request if OTP has expired or was already used', async () => {
      // 1. Send OTP
      const sendResponse = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({
          countryCode: '+91',
          mobileNumber: '9876543210',
        });

      const otp = sendResponse.body.data.otp as string;

      // 2. Verify OTP (first use should succeed)
      const verify1 = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          countryCode: '+91',
          mobileNumber: '9876543210',
          otp,
        });
      expect(verify1.status).toBe(HTTP_STATUS.OK);

      // 3. Verify OTP again (should fail)
      const verify2 = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          countryCode: '+91',
          mobileNumber: '9876543210',
          otp,
        });

      expect(verify2.status).toBe(HTTP_STATUS.BAD_REQUEST);
    });
  });

  describe('POST /api/v1/auth/admin/otp/send', () => {
    it('should return 404 and not create a user when the number is unknown', async () => {
      const response = await request(app)
        .post('/api/v1/auth/admin/otp/send')
        .send({
          countryCode: '+91',
          mobileNumber: '9000000001',
        });

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(response.body).toMatchObject({
        success: false,
        message: 'No admin found',
      });

      expect(await prisma.user.count()).toBe(0);
    });

    it('should return 404 when the number belongs to a customer, not an admin', async () => {
      const customerRole = await prisma.role.create({ data: { name: 'customer' } });
      await prisma.user.create({
        data: {
          name: 'Customer User',
          mobileNumber: '9000000002',
          countryCode: '+91',
          roleId: customerRole.id,
        },
      });

      const response = await request(app)
        .post('/api/v1/auth/admin/otp/send')
        .send({
          countryCode: '+91',
          mobileNumber: '9000000002',
        });

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(response.body).toMatchObject({
        success: false,
        message: 'No admin found',
      });

      expect(await prisma.user.count()).toBe(1);
    });

    it('should send an OTP when the stored number includes the country code', async () => {
      const adminRole = await prisma.role.create({ data: { name: 'admin' } });
      await prisma.user.create({
        data: {
          name: 'Admin User',
          mobileNumber: '+919000000001',
          countryCode: '+91',
          roleId: adminRole.id,
        },
      });

      const response = await request(app)
        .post('/api/v1/auth/admin/otp/send')
        .send({
          countryCode: '+91',
          mobileNumber: '9000000001',
        });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.otp).toHaveLength(6);
    });

    it('should send an OTP when an admin already exists for the number', async () => {
      const adminRole = await prisma.role.create({ data: { name: 'admin' } });
      await prisma.user.create({
        data: {
          name: 'Admin User',
          mobileNumber: '9000000001',
          countryCode: '+91',
          roleId: adminRole.id,
        },
      });

      const response = await request(app)
        .post('/api/v1/auth/admin/otp/send')
        .send({
          countryCode: '+91',
          mobileNumber: '9000000001',
        });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toMatchObject({
        success: true,
        message: 'OTP sent successfully',
      });
      expect(response.body.data).toHaveProperty('otp');
      expect(response.body.data.otp).toHaveLength(6);
      expect(response.body.data.isNewUser).toBeUndefined();
      expect(await prisma.user.count()).toBe(1);
    });
  });

  describe('POST /api/v1/auth/admin/otp/verify', () => {
    it('should log in an existing admin and never create a user', async () => {
      const adminRole = await prisma.role.create({ data: { name: 'admin' } });
      await prisma.user.create({
        data: {
          name: 'Admin User',
          mobileNumber: '9000000001',
          countryCode: '+91',
          roleId: adminRole.id,
        },
      });

      const sendResponse = await request(app)
        .post('/api/v1/auth/admin/otp/send')
        .send({
          countryCode: '+91',
          mobileNumber: '9000000001',
        });

      const otp = sendResponse.body.data.otp as string;

      const verifyResponse = await request(app)
        .post('/api/v1/auth/admin/otp/verify')
        .send({
          countryCode: '+91',
          mobileNumber: '9000000001',
          otp,
        });

      expect(verifyResponse.status).toBe(HTTP_STATUS.OK);
      expect(verifyResponse.body).toMatchObject({
        success: true,
        message: 'Authentication successful',
        data: {
          user: {
            name: 'Admin User',
            role: {
              name: 'admin',
            },
          },
        },
      });
      expect(verifyResponse.body.data.token).toBeDefined();
      expect(await prisma.user.count()).toBe(1);
    });

    it('should return 404 and not create a user when a customer OTP is verified on the admin endpoint', async () => {
      const sendResponse = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({
          countryCode: '+91',
          mobileNumber: '9876543210',
        });

      const otp = sendResponse.body.data.otp as string;

      const verifyResponse = await request(app)
        .post('/api/v1/auth/admin/otp/verify')
        .send({
          countryCode: '+91',
          mobileNumber: '9876543210',
          otp,
        });

      expect(verifyResponse.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(verifyResponse.body).toMatchObject({
        success: false,
        message: 'No admin found',
      });
      expect(await prisma.user.count()).toBe(0);
    });
  });
});
