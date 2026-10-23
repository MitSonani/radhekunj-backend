import { logger } from '../../utils/logger.js';
import { SmsProvider, SendOtpOptions, SendOtpResult, maskPhoneNumber } from './types.js';

export class Fast2SmsProvider implements SmsProvider {
  name = 'fast2sms';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env['FAST2SMS_API_KEY'] || '';
  }

  async sendOtp(options: SendOtpOptions): Promise<SendOtpResult> {
    const masked = maskPhoneNumber(`${options.countryCode || ''}${options.to}`);

    if (!this.apiKey) {
      logger.error('[Fast2SMS] Missing API key configuration');
      return {
        success: false,
        provider: this.name,
        error: 'Fast2SMS API key not configured',
      };
    }

    // Clean Indian 10-digit number
    const recipientNumber = options.to.replace(/\D/g, '').slice(-10);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: options.otp,
          numbers: recipientNumber,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        logger.error('[Fast2SMS] Gateway HTTP error', { status: response.status, to: masked });
        return {
          success: false,
          provider: this.name,
          error: `Fast2SMS HTTP error ${response.status}: ${text}`,
        };
      }

      const data = (await response.json()) as { return?: boolean; message?: string[]; request_id?: string };

      if (!data.return) {
        const errorMsg = Array.isArray(data.message) ? data.message.join(', ') : 'Delivery rejected by gateway';
        logger.error('[Fast2SMS] Gateway rejected message', { to: masked, error: errorMsg });
        return {
          success: false,
          provider: this.name,
          error: errorMsg,
        };
      }

      logger.info('[Fast2SMS] OTP sent successfully', { to: masked, requestId: data.request_id });
      return {
        success: true,
        provider: this.name,
        messageId: data.request_id,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('[Fast2SMS] Network or gateway failure', { to: masked, error: errorMsg });
      return {
        success: false,
        provider: this.name,
        error: errorMsg,
      };
    }
  }
}
