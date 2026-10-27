import { logger } from '../../utils/logger.js';
import { WhatsAppProvider, SendWhatsAppOtpOptions, SendWhatsAppResult, maskPhoneNumber } from './types.js';

export interface DispatchedWhatsAppMessage {
  to: string;
  countryCode?: string;
  timestamp: Date;
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  name = 'mock';
  private static simulateFailure = false;
  private static dispatchedMessages: DispatchedWhatsAppMessage[] = [];

  static setSimulateFailure(shouldFail: boolean) {
    this.simulateFailure = shouldFail;
  }

  static getDispatchedMessages(): DispatchedWhatsAppMessage[] {
    return [...this.dispatchedMessages];
  }

  static clearDispatchedMessages(): void {
    this.dispatchedMessages = [];
    this.simulateFailure = false;
  }

  sendOtp(options: SendWhatsAppOtpOptions): Promise<SendWhatsAppResult> {
    const masked = maskPhoneNumber(`${options.countryCode || ''}${options.to}`);

    if (MockWhatsAppProvider.simulateFailure) {
      logger.warn('[MOCK WHATSAPP] Simulated delivery failure', { to: masked });
      return Promise.resolve({
        success: false,
        provider: this.name,
        error: 'Simulated WhatsApp gateway delivery failure',
      });
    }

    MockWhatsAppProvider.dispatchedMessages.push({
      to: options.to,
      countryCode: options.countryCode,
      timestamp: new Date(),
    });

    logger.info('[MOCK WHATSAPP] OTP template dispatched successfully', { to: masked });

    return Promise.resolve({
      success: true,
      provider: this.name,
      messageId: `mock_wa_${Date.now()}`,
    });
  }
}
