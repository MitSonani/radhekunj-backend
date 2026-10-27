/* eslint-disable @typescript-eslint/require-await */
import { logger } from '../../utils/logger.js';
import { SmsProvider, SendOtpOptions, SendOtpResult, maskPhoneNumber } from './types.js';

export interface DispatchedMockMessage {
  to: string;
  countryCode?: string;
  timestamp: Date;
}

export class MockSmsProvider implements SmsProvider {
  name = 'mock';
  private static simulateFailure = false;
  private static dispatchedMessages: DispatchedMockMessage[] = [];

  static setSimulateFailure(shouldFail: boolean) {
    this.simulateFailure = shouldFail;
  }

  static getDispatchedMessages(): DispatchedMockMessage[] {
    return [...this.dispatchedMessages];
  }

  static clearDispatchedMessages(): void {
    this.dispatchedMessages = [];
    this.simulateFailure = false;
  }

  async sendOtp(options: SendOtpOptions): Promise<SendOtpResult> {
    const masked = maskPhoneNumber(`${options.countryCode || ''}${options.to}`);

    if (MockSmsProvider.simulateFailure) {
      logger.warn('[MOCK SMS PROVIDER] Simulated gateway failure', { to: masked });
      return {
        success: false,
        provider: this.name,
        error: 'Simulated gateway delivery failure',
      };
    }

    MockSmsProvider.dispatchedMessages.push({
      to: options.to,
      countryCode: options.countryCode,
      timestamp: new Date(),
    });

    logger.info('[MOCK SMS PROVIDER] OTP dispatched successfully', { to: masked });

    return {
      success: true,
      provider: this.name,
      messageId: `mock_msg_${Date.now()}`,
    };
  }
}
