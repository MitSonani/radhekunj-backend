import { logger } from '../../utils/logger.js';
import { WhatsAppProvider, SendWhatsAppOtpOptions, SendWhatsAppResult, maskPhoneNumber } from './types.js';

export interface Msg91Config {
  authKey?: string;
  integratedNumber?: string;
  templateName?: string;
  languageCode?: string;
}

export class Msg91WhatsAppProvider implements WhatsAppProvider {
  name = 'msg91';
  private authKey: string;
  private integratedNumber: string;
  private templateName: string;
  private languageCode: string;

  constructor(config?: Msg91Config) {
    this.authKey = config?.authKey || process.env['MSG91_AUTH_KEY'] || '';
    this.integratedNumber = config?.integratedNumber || process.env['MSG91_INTEGRATED_NUMBER'] || '';
    this.templateName = config?.templateName || process.env['MSG91_WHATSAPP_TEMPLATE_NAME'] || 'otp_verification';
    this.languageCode = config?.languageCode || process.env['MSG91_WHATSAPP_LANGUAGE_CODE'] || 'en';
  }

  async sendOtp(options: SendWhatsAppOtpOptions): Promise<SendWhatsAppResult> {
    const masked = maskPhoneNumber(`${options.countryCode || ''}${options.to}`);

    if (!this.authKey) {
      logger.error('[MSG91 WhatsApp] Missing authkey configuration');
      return {
        success: false,
        provider: this.name,
        error: 'MSG91 authkey not configured',
      };
    }

    if (!this.integratedNumber) {
      logger.error('[MSG91 WhatsApp] Missing integrated_number configuration');
      return {
        success: false,
        provider: this.name,
        error: 'MSG91 integrated WhatsApp number not configured',
      };
    }

    // Format recipient number (e.g. 919876543210 without '+')
    let recipient = options.to.replace(/\D/g, '');
    if (recipient.length === 10) {
      const code = (options.countryCode || '91').replace(/\D/g, '') || '91';
      recipient = `${code}${recipient}`;
    }

    // Standard MSG91 WhatsApp Outbound Template payload contract
    const payload = {
      integrated_number: this.integratedNumber.replace(/\D/g, ''),
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        recipient,
        type: 'template',
        template: {
          name: this.templateName,
          language: {
            code: this.languageCode,
          },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: options.otp,
                },
              ],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [
                {
                  type: 'text',
                  text: options.otp,
                },
              ],
            },
          ],
        },
      },
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
        method: 'POST',
        headers: {
          authkey: this.authKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        logger.error('[MSG91 WhatsApp] Gateway HTTP error', { status: response.status, to: masked });
        return {
          success: false,
          provider: this.name,
          error: `MSG91 HTTP error ${response.status}: ${text}`,
        };
      }

      const data = (await response.json()) as {
        status?: string;
        hasError?: boolean;
        message?: string;
        data?: { message_id?: string; request_id?: string };
      };

      if (data.hasError || data.status === 'error' || data.status === 'fail') {
        const errorMsg = data.message || 'WhatsApp message rejected by MSG91 gateway';
        logger.error('[MSG91 WhatsApp] Gateway rejected message', { to: masked, error: errorMsg });
        return {
          success: false,
          provider: this.name,
          error: errorMsg,
        };
      }

      const messageId = data.data?.message_id || data.data?.request_id || `msg91_wa_${Date.now()}`;
      logger.info('[MSG91 WhatsApp] OTP template sent successfully', { to: masked, messageId });

      return {
        success: true,
        provider: this.name,
        messageId,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('[MSG91 WhatsApp] Network or gateway failure', { to: masked, error: errorMsg });
      return {
        success: false,
        provider: this.name,
        error: errorMsg,
      };
    }
  }
}
