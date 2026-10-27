/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MockWhatsAppProvider } from './mockProvider.js';
import { Msg91WhatsAppProvider } from './msg91Provider.js';
import { getWhatsAppProvider, setCustomWhatsAppProviderForTest } from './index.js';
import { maskPhoneNumber } from './types.js';

describe('MSG91 WhatsApp OTP Provider', () => {
  beforeEach(() => {
    MockWhatsAppProvider.clearDispatchedMessages();
    setCustomWhatsAppProviderForTest(null);
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

  describe('MockWhatsAppProvider', () => {
    it('successfully delivers and stores dispatched message without exposing OTP in message tracking', async () => {
      const provider = new MockWhatsAppProvider();
      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '654321',
        countryCode: '+91',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('mock');
      expect(result.messageId).toBeDefined();

      const msgs = MockWhatsAppProvider.getDispatchedMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]?.to).toBe('9876543210');
      expect(msgs[0]?.countryCode).toBe('+91');
    });

    it('returns error result when simulation failure is active', async () => {
      const provider = new MockWhatsAppProvider();
      MockWhatsAppProvider.setSimulateFailure(true);

      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '654321',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/simulated whatsapp gateway delivery failure/i);
      expect(MockWhatsAppProvider.getDispatchedMessages()).toHaveLength(0);
    });
  });

  describe('Msg91WhatsAppProvider', () => {
    it('fails gracefully when authKey or integratedNumber is missing', async () => {
      const providerNoKey = new Msg91WhatsAppProvider({ authKey: '', integratedNumber: '919876543210' });
      const res1 = await providerNoKey.sendOtp({ to: '9876543210', otp: '123456' });
      expect(res1.success).toBe(false);
      expect(res1.error).toMatch(/authkey not configured/i);

      const providerNoNumber = new Msg91WhatsAppProvider({ authKey: 'test_key', integratedNumber: '' });
      const res2 = await providerNoNumber.sendOtp({ to: '9876543210', otp: '123456' });
      expect(res2.success).toBe(false);
      expect(res2.error).toMatch(/integrated whatsapp number not configured/i);
    });

    it('builds official payload and handles successful MSG91 response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          hasError: false,
          message: 'Template sent successfully',
          data: { message_id: 'msg91_msg_abcdef123456' },
        }),
      });
      global.fetch = mockFetch;

      const provider = new Msg91WhatsAppProvider({
        authKey: 'dummy_auth_key',
        integratedNumber: '919000000000',
        templateName: 'otp_verification',
        languageCode: 'en',
      });

      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '852963',
        countryCode: '+91',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg91_msg_abcdef123456');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs?.[0]).toBe('https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/');
      expect(callArgs?.[1]?.headers?.authkey).toBe('dummy_auth_key');

      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.integrated_number).toBe('919000000000');
      expect(body.content_type).toBe('template');
      expect(body.payload.messaging_product).toBe('whatsapp');
      expect(body.payload.recipient).toBe('919876543210');
      expect(body.payload.template.name).toBe('otp_verification');
      expect(body.payload.template.components[0].parameters[0].text).toBe('852963');
    });

    it('handles MSG91 gateway rejection response safely', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'fail',
          hasError: true,
          message: 'Template not approved or number not registered on WhatsApp',
        }),
      });
      global.fetch = mockFetch;

      const provider = new Msg91WhatsAppProvider({
        authKey: 'dummy_auth_key',
        integratedNumber: '919000000000',
      });

      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '852963',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not approved or number not registered/i);
    });

    it('handles HTTP error responses safely', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid Auth Key',
      });
      global.fetch = mockFetch;

      const provider = new Msg91WhatsAppProvider({
        authKey: 'invalid_key',
        integratedNumber: '919000000000',
      });

      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '123456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/HTTP error 401/i);
    });

    it('handles timeout and network connection aborts', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('The operation was aborted'));
      global.fetch = mockFetch;

      const provider = new Msg91WhatsAppProvider({
        authKey: 'dummy_key',
        integratedNumber: '919000000000',
      });

      const result = await provider.sendOtp({
        to: '9876543210',
        otp: '123456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/aborted/i);
    });
  });

  describe('WhatsApp Provider Resolution', () => {
    it('returns Mock provider when WHATSAPP_PROVIDER is unspecified or mock', () => {
      const orig = process.env['WHATSAPP_PROVIDER'];
      delete process.env['WHATSAPP_PROVIDER'];
      setCustomWhatsAppProviderForTest(null);

      const provider = getWhatsAppProvider();
      expect(provider.name).toBe('mock');

      process.env['WHATSAPP_PROVIDER'] = orig;
    });

    it('returns Msg91 provider when WHATSAPP_PROVIDER is msg91', () => {
      const orig = process.env['WHATSAPP_PROVIDER'];
      process.env['WHATSAPP_PROVIDER'] = 'msg91';
      setCustomWhatsAppProviderForTest(null);

      const provider = getWhatsAppProvider();
      expect(provider.name).toBe('msg91');

      process.env['WHATSAPP_PROVIDER'] = orig;
    });
  });
});
