/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { _clearOtpSendLocksForTest } from '../../shared/utils/otpStore.js';

describe('Customer Profile Management Suite', () => {
  const app = createApp();
  let authToken = '';
  let testUserId = '';

  beforeEach(async () => {
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await _clearOtpSendLocksForTest();

    // 1. Send OTP
    const sendRes = await request(app)
      .post('/api/v1/auth/otp/send')
      .send({
        countryCode: '+91',
        mobileNumber: '9988776655',
      });

    const otp = sendRes.body.data.otp as string;

    // 2. Verify OTP and get Token
    const verifyRes = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({
        countryCode: '+91',
        mobileNumber: '9988776655',
        otp,
        name: 'Initial Customer Name',
      });

    authToken = verifyRes.body.data.token as string;
    testUserId = verifyRes.body.data.user.id as string;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
  });

  describe('GET /api/v1/auth/me', () => {
    it('1. Rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('2. Returns authenticated customer profile accurately', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: testUserId,
        name: 'Initial Customer Name',
        mobileNumber: '9988776655',
        countryCode: '+91',
        role: {
          name: 'customer',
        },
      });
    });
  });

  describe('PATCH /api/v1/auth/profile', () => {
    it('3. Rejects unauthenticated profile update with 401 Unauthorized', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/profile')
        .send({ name: 'Hacker Name' });

      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('4. Updates customer name successfully and reflects in DB', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Radhika Patel' });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Radhika Patel');

      // Verify in DB
      const dbUser = await prisma.user.findUnique({ where: { id: testUserId } });
      expect(dbUser?.name).toBe('Radhika Patel');
    });

    it('5. Rejects name update with less than 2 characters with 422', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'R' });

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toContain('Name must be at least 2 characters');
    });

    it('6. Rejects attempts to modify protected fields like role or mobileNumber with 422', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Valid Name',
          role: 'admin',
          mobileNumber: '9111111111',
        });

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
      expect(res.body.success).toBe(false);

      // Verify DB role was not changed
      const dbUser = await prisma.user.findUnique({
        where: { id: testUserId },
        include: { role: true },
      });
      expect(dbUser?.role?.name).toBe('customer');
      expect(dbUser?.mobileNumber).toBe('9988776655');
    });
  });
});
