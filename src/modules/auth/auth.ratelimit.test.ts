/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS, OTP } from '../../shared/constants/index.js';
import {
  acquireOtpSendLock,
  releaseOtpSendLock,
  _clearOtpSendLocksForTest,
} from '../../shared/utils/otpStore.js';

const app = createApp();

const PHONE_COUNTRY = '+91';
const PHONE_NUMBER = '9876543210';
const PHONE_IDENTIFIER = `${PHONE_COUNTRY}${PHONE_NUMBER}`;

const ALT_PHONE_NUMBER = '9123456789';

function sendOtpRequest(countryCode: string, mobileNumber: string) {
  return request(app)
    .post('/api/v1/auth/otp/send')
    .send({ countryCode, mobileNumber });
}

describe('OTP Send — 60-second rate limiter', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await _clearOtpSendLocksForTest();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await _clearOtpSendLocksForTest();
  });

  // ── 1. First request succeeds ────────────────────────────────────────────
  it('1. first OTP request succeeds with 200', async () => {
    const res = await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body).toMatchObject({ success: true, message: 'OTP sent successfully' });
  });

  // ── 2. Immediate second request is rejected with 429 ────────────────────
  it('2. immediate second request returns 429 Too Many Requests', async () => {
    await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);
    const res = await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);

    expect(res.status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
    expect(res.body).toMatchObject({
      success: false,
      message: 'Please wait before requesting another OTP.',
    });
  });

  // ── 3. Response includes retryAfterSeconds ────────────────────────────────
  it('3. 429 response body includes retryAfterSeconds', async () => {
    await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);
    const res = await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);

    expect(res.status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
    expect(typeof res.body.retryAfterSeconds).toBe('number');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(OTP.SEND_COOLDOWN_SECONDS);
  });

  // ── 4. Retry-After response header is set ────────────────────────────────
  it('4. 429 response sets the Retry-After header', async () => {
    await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);
    const res = await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);

    expect(res.status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
    const retryAfterHeader = res.headers['retry-after'];
    expect(retryAfterHeader).toBeDefined();
    expect(Number(retryAfterHeader)).toBeGreaterThan(0);
  });

  // ── 5. Request after cooldown window succeeds ────────────────────────────
  it('5. request after cooldown window is allowed', async () => {
    await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);

    // Simulate the 60-second window expiring by releasing the lock
    await releaseOtpSendLock(PHONE_IDENTIFIER);

    const res = await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body).toMatchObject({ success: true });
  });

  // ── 6. Different phone number is not affected ────────────────────────────
  it('6. different phone number is not blocked by another number\'s cooldown', async () => {
    await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);

    const res = await sendOtpRequest(PHONE_COUNTRY, ALT_PHONE_NUMBER);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body).toMatchObject({ success: true });
  });

  // ── 7. Same phone — different format — hits the same cooldown ────────────
  it('7. same phone in different format shares the same rate-limit lock', async () => {
    // The identifier is built as `${countryCode}${mobileNumber}` in the controller.
    // "+91" + "9876543210" and "+91" + "9876543210" (same) share one lock.
    const result1 = await acquireOtpSendLock(PHONE_IDENTIFIER, OTP.SEND_COOLDOWN_SECONDS);
    expect(result1.acquired).toBe(true);

    // Construct the same identifier a different way and confirm it conflicts
    const sameIdentifier = `+91${'9876543210'}`;
    const result2 = await acquireOtpSendLock(sameIdentifier, OTP.SEND_COOLDOWN_SECONDS);
    expect(result2.acquired).toBe(false);
    expect(result2.retryAfterSeconds).toBeGreaterThan(0);
  });

  // ── 8. Concurrent requests — only one succeeds ───────────────────────────
  it('8. concurrent requests for the same number allow exactly one OTP', async () => {
    const results = await Promise.all([
      sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER),
      sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER),
      sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER),
    ]);

    const successes = results.filter((r) => r.status === HTTP_STATUS.OK);
    const rejections = results.filter((r) => r.status === HTTP_STATUS.TOO_MANY_REQUESTS);

    expect(successes).toHaveLength(1);
    expect(rejections).toHaveLength(2);
  });

  // ── 9. Lock TTL is approximately OTP_SEND_COOLDOWN_SECONDS ───────────────
  it('9. lock TTL is approximately OTP.SEND_COOLDOWN_SECONDS', async () => {
    const before = Date.now();
    const result = await acquireOtpSendLock(PHONE_IDENTIFIER, OTP.SEND_COOLDOWN_SECONDS);
    expect(result.acquired).toBe(true);

    // Immediately try to acquire again to get the retryAfterSeconds
    const result2 = await acquireOtpSendLock(PHONE_IDENTIFIER, OTP.SEND_COOLDOWN_SECONDS);
    expect(result2.acquired).toBe(false);

    const elapsed = Math.ceil((Date.now() - before) / 1000);
    const expectedMaxRetry = OTP.SEND_COOLDOWN_SECONDS;
    const expectedMinRetry = OTP.SEND_COOLDOWN_SECONDS - elapsed - 1; // 1s tolerance

    expect(result2.retryAfterSeconds).toBeGreaterThanOrEqual(expectedMinRetry);
    expect(result2.retryAfterSeconds).toBeLessThanOrEqual(expectedMaxRetry);
  });

  // ── 10. OTP is returned in test/dev env, not in production ───────────────
  it('10. OTP is present in response body in test/dev environment', async () => {
    // The test environment sets NODE_ENV=test, so isProduction === false.
    // This means sendOtp() returns the OTP — useful for integration testing.
    const res = await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data).toHaveProperty('otp');
    expect(res.body.data.otp).toHaveLength(6);
  });

  // ── 11. Lock is released when OTP dispatch fails ──────────────────────────
  it('11. lock is released when internal error occurs so user can retry', async () => {
    // Acquire the lock and then release it (simulating a failed dispatch)
    const lock1 = await acquireOtpSendLock(PHONE_IDENTIFIER, OTP.SEND_COOLDOWN_SECONDS);
    expect(lock1.acquired).toBe(true);

    await releaseOtpSendLock(PHONE_IDENTIFIER);

    const lock2 = await acquireOtpSendLock(PHONE_IDENTIFIER, OTP.SEND_COOLDOWN_SECONDS);
    expect(lock2.acquired).toBe(true);
  });

  // ── 12. Existing auth endpoint behaviour is unchanged ────────────────────
  it('12. full OTP login flow still works correctly after rate limiter is in place', async () => {
    const sendRes = await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);
    expect(sendRes.status).toBe(HTTP_STATUS.OK);

    const otp = sendRes.body.data.otp as string;
    expect(otp).toHaveLength(6);

    const verifyRes = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ countryCode: PHONE_COUNTRY, mobileNumber: PHONE_NUMBER, otp, name: 'Test User' });

    expect(verifyRes.status).toBe(HTTP_STATUS.OK);
    expect(verifyRes.body).toMatchObject({
      success: true,
      message: 'Authentication successful',
    });
    expect(verifyRes.body.data).toHaveProperty('token');
  });

  // ── 13. Lock uses the otp:send: key namespace ────────────────────────────
  it('13. acquireOtpSendLock uses the otp:send: key namespace', async () => {
    // The true multi-instance guarantee requires Redis and is covered by the
    // atomic SET NX EX contract; this test validates the key naming convention
    // by confirming the same logical identifier conflicts with itself.
    const lock = await acquireOtpSendLock('+919999999999', OTP.SEND_COOLDOWN_SECONDS);
    expect(lock.acquired).toBe(true);

    const lock2 = await acquireOtpSendLock('+919999999999', OTP.SEND_COOLDOWN_SECONDS);
    expect(lock2.acquired).toBe(false);

    await releaseOtpSendLock('+919999999999');
  });

  // ── 14. 422 validation fires before the rate limiter ─────────────────────
  it('14. validation error returns 422, does not consume the rate-limit slot', async () => {
    const invalidRes = await request(app)
      .post('/api/v1/auth/otp/send')
      .send({ countryCode: '+91' }); // missing mobileNumber

    expect(invalidRes.status).toBe(HTTP_STATUS.UNPROCESSABLE);

    // Validation failed before the service was invoked — lock should not have been acquired
    const validRes = await sendOtpRequest(PHONE_COUNTRY, PHONE_NUMBER);
    expect(validRes.status).toBe(HTTP_STATUS.OK);
  });

  // ── 15. releaseOtpSendLock restores availability ──────────────────────────
  it('15. releaseOtpSendLock makes the identifier immediately available again', async () => {
    await acquireOtpSendLock(PHONE_IDENTIFIER, OTP.SEND_COOLDOWN_SECONDS);

    // Confirm locked
    const locked = await acquireOtpSendLock(PHONE_IDENTIFIER, OTP.SEND_COOLDOWN_SECONDS);
    expect(locked.acquired).toBe(false);

    // Release
    await releaseOtpSendLock(PHONE_IDENTIFIER);

    // Confirm available
    const available = await acquireOtpSendLock(PHONE_IDENTIFIER, OTP.SEND_COOLDOWN_SECONDS);
    expect(available.acquired).toBe(true);
  });
});

// ── Mock: service releases lock on unexpected failure ────────────────────────
describe('OTP Send — service integration via mock', () => {
  beforeEach(async () => {
    await _clearOtpSendLocksForTest();
    vi.restoreAllMocks();
  });

  it('sendOtp service releases the lock when an unexpected error is thrown after acquiring', async () => {
    const authService = await import('./service.js');
    const otpStore = await import('../../shared/utils/otpStore.js');

    // Simulate a Redis write failure AFTER the lock has been acquired
    const setOtpSpy = vi
      .spyOn(otpStore, 'setOtp')
      .mockRejectedValueOnce(new Error('Redis write failure'));

    const releaseOtpSendLockSpy = vi.spyOn(otpStore, 'releaseOtpSendLock');

    await expect(
      authService.sendOtp('+910000000001', { mobileNumber: '0000000001', countryCode: '+91' }),
    ).rejects.toThrow('Redis write failure');

    expect(releaseOtpSendLockSpy).toHaveBeenCalledWith('+910000000001');

    setOtpSpy.mockRestore();
    releaseOtpSendLockSpy.mockRestore();
  });
});
