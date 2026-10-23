import { SmsProvider } from './types.js';
import { MockSmsProvider } from './mockProvider.js';
import { Fast2SmsProvider } from './fast2smsProvider.js';

export * from './types.js';
export * from './mockProvider.js';
export * from './fast2smsProvider.js';

let activeProvider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (activeProvider) {
    return activeProvider;
  }

  const providerType = (process.env['SMS_PROVIDER'] || 'mock').trim().toLowerCase();

  switch (providerType) {
    case 'fast2sms':
      activeProvider = new Fast2SmsProvider();
      break;
    case 'mock':
    default:
      activeProvider = new MockSmsProvider();
      break;
  }

  return activeProvider;
}

export function setCustomSmsProviderForTest(provider: SmsProvider | null): void {
  activeProvider = provider;
}
