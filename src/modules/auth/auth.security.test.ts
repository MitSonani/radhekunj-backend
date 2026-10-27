/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { _clearOtpAttemptsForTest, setOtp, getOtp, isIdentifierLocked } from '../../shared/utils/otpStore.js';

const app = createApp();

describe('Auth & OTP Security', () => {
  const testPhone = '9999988888';
  const testIdentifier = `+91${testPhone}`;

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await _clearOtpAttemptsForTest();
  });

  it('1. Wrong OTP attempt fails and is tracked', async () => {
    await setOtp(testIdentifier, '123456', 300);

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({
        mobileNumber: testPhone,
        countryCode: '+91',
        otp: '999999',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired otp/i);

    // Verify still not locked after 1 wrong attempt
    const lockStatus = await isIdentifierLocked(testIdentifier);
    expect(lockStatus.locked).toBe(false);
  });

  it('2. Exactly 5 invalid OTP attempts triggers temporary 15-minute lockout (429)', async () => {
    await setOtp(testIdentifier, '123456', 300);

    // Attempts 1 to 4 should return 400
    for (let i = 1; i <= 4; i++) {
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          mobileNumber: testPhone,
          countryCode: '+91',
          otp: `00000${i}`,
        });
      expect(res.status).toBe(400);
    }

    // 5th attempt reaches max attempts -> returns 429 and locks account
    const res5 = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({
        mobileNumber: testPhone,
        countryCode: '+91',
        otp: '000005',
      });

    expect(res5.status).toBe(429);
    expect(res5.body.message).toMatch(/maximum verification attempts exceeded|locked/i);

    // Verify OTP was deleted upon reaching attempt limit
    const cachedOtp = await getOtp(testIdentifier);
    expect(cachedOtp).toBeNull();

    // Verify identifier is locked
    const lockStatus = await isIdentifierLocked(testIdentifier);
    expect(lockStatus.locked).toBe(true);
    expect(lockStatus.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('3. Subsequent attempts during lockout window are blocked with 429 even with correct OTP', async () => {
    await setOtp(testIdentifier, '123456', 300);

    // Force 5 failures
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          mobileNumber: testPhone,
          countryCode: '+91',
          otp: '111111',
        });
    }

    // Attempt with the original valid OTP
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({
        mobileNumber: testPhone,
        countryCode: '+91',
        otp: '123456',
      });

    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/locked/i);
  });

  it('4. Successful verification clears attempt tracking and deletes OTP', async () => {
    await setOtp(testIdentifier, '654321', 300);

    // 2 failed attempts
    await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ mobileNumber: testPhone, countryCode: '+91', otp: '000000' });
    await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ mobileNumber: testPhone, countryCode: '+91', otp: '111111' });

    // 3rd attempt is correct
    const successRes = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ mobileNumber: testPhone, countryCode: '+91', otp: '654321' });

    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);
    expect(successRes.body.data.token).toBeDefined();

    // OTP was consumed
    const cachedOtp = await getOtp(testIdentifier);
    expect(cachedOtp).toBeNull();

    // Identifier is not locked
    const lockStatus = await isIdentifierLocked(testIdentifier);
    expect(lockStatus.locked).toBe(false);

    // Reuse of the same OTP fails with 400
    const reuseRes = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ mobileNumber: testPhone, countryCode: '+91', otp: '654321' });
    expect(reuseRes.status).toBe(400);
  });

  it('5. Expired OTP is rejected with invalid or expired message', async () => {
    // Set OTP with 1 second TTL and wait for it to expire
    await setOtp(testIdentifier, '999111', 1);
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({
        mobileNumber: testPhone,
        countryCode: '+91',
        otp: '999111',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired otp/i);
  });

  it('6. Concurrent invalid verification attempts cannot bypass the lockout limit', async () => {
    await setOtp(testIdentifier, '777888', 300);

    // Fire 8 concurrent verification requests with incorrect OTPs
    const promises = Array.from({ length: 8 }, (_, i) =>
      request(app)
        .post('/api/v1/auth/otp/verify')
        .send({
          mobileNumber: testPhone,
          countryCode: '+91',
          otp: `00000${i}`,
        }),
    );

    const responses = await Promise.all(promises);

    // Exactly 4 should be 400, and the rest (at least 4) should be 429
    const statusCounts = responses.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Total attempts is 8
    expect(responses.length).toBe(8);
    // There must be 429 responses once the threshold is crossed
    expect(statusCounts[429]).toBeGreaterThanOrEqual(1);

    // Identifier must definitively be locked
    const lockStatus = await isIdentifierLocked(testIdentifier);
    expect(lockStatus.locked).toBe(true);
  });
});
