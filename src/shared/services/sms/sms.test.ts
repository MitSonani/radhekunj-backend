/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MockSmsProvider } from './mockProvider.js';
import { Fast2SmsProvider } from './fast2smsProvider.js';
import { getSmsProvider, setCustomSmsProviderForTest } from './index.js';
import { maskPhoneNumber } from './types.js';

describe('SMS Provider System', () => {
  beforeEach(() => {
    MockSmsProvider.clearDispatchedMessages();
    setCustomSmsProviderForTest(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Phone Number Masking', () => {
    it('masks phone numbers safely', () => {
      expect(maskPhoneNumber('9876543210')).toBe('987****210');
      expect(maskPhoneNumber('+919876543210')).toBe('+91****210');
      expect(maskPhoneNumber('123')).toBe('****');
    });
  });

  describe('MockSmsProvider', () => {
    it('successfully delivers and stores dispatched message without exposing OTP in memory query', async () => {
      const provider = new MockSmsProvider();
      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '123456',
        countryCode: '+91',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('mock');
      expect(result.messageId).toBeDefined();

      const msgs = MockSmsProvider.getDispatchedMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]?.to).toBe('9876543210');
      expect(msgs[0]?.countryCode).toBe('+91');
    });

    it('returns error result when simulation failure is active', async () => {
      const provider = new MockSmsProvider();
      MockSmsProvider.setSimulateFailure(true);

      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '123456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/simulated gateway delivery failure/i);
      expect(MockSmsProvider.getDispatchedMessages()).toHaveLength(0);
    });
  });

  describe('Fast2SmsProvider', () => {
    it('fails gracefully when API key is missing', async () => {
      const provider = new Fast2SmsProvider('');
      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '654321',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/api key not configured/i);
    });

    it('handles successful Fast2SMS gateway HTTP response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          return: true,
          request_id: 'fast2sms_req_12345',
          message: ['SMS sent successfully'],
        }),
      });
      global.fetch = mockFetch;

      const provider = new Fast2SmsProvider('dummy_api_key');
      const result = await provider.sendOtp({
        to: '+919876543210',
        otp: '789012',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('fast2sms_req_12345');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs?.[0]).toBe('https://www.fast2sms.com/dev/bulkV2');
      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.numbers).toBe('9876543210');
      expect(body.variables_values).toBe('789012');
    });

    it('handles gateway refusal response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          return: false,
          message: ['Invalid numbers parameter or insufficient balance'],
        }),
      });
      global.fetch = mockFetch;

      const provider = new Fast2SmsProvider('dummy_api_key');
      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '789012',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/insufficient balance/i);
    });

    it('handles network error / timeout safely', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection timeout'));
      global.fetch = mockFetch;

      const provider = new Fast2SmsProvider('dummy_api_key');
      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '789012',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Connection timeout/i);
    });
  });

  describe('Provider Factory', () => {
    it('returns Mock provider when SMS_PROVIDER is mock or unspecified', () => {
      const origEnv = process.env['SMS_PROVIDER'];
      delete process.env['SMS_PROVIDER'];
      setCustomSmsProviderForTest(null);

      const provider = getSmsProvider();
      expect(provider.name).toBe('mock');

      process.env['SMS_PROVIDER'] = origEnv;
    });

    it('returns Fast2Sms provider when configured in env', () => {
      const origEnv = process.env['SMS_PROVIDER'];
      process.env['SMS_PROVIDER'] = 'fast2sms';
      setCustomSmsProviderForTest(null);

      const provider = getSmsProvider();
      expect(provider.name).toBe('fast2sms');

      process.env['SMS_PROVIDER'] = origEnv;
    });
  });
});
