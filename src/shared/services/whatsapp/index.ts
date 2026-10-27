import { WhatsAppProvider } from './types.js';
import { MockWhatsAppProvider } from './mockProvider.js';
import { Msg91WhatsAppProvider } from './msg91Provider.js';

export * from './types.js';
export * from './mockProvider.js';
export * from './msg91Provider.js';

let activeWhatsAppProvider: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (activeWhatsAppProvider) {
    return activeWhatsAppProvider;
  }

  const providerType = (process.env['WHATSAPP_PROVIDER'] || 'mock').trim().toLowerCase();

  switch (providerType) {
    case 'msg91':
      activeWhatsAppProvider = new Msg91WhatsAppProvider();
      break;
    case 'mock':
    default:
      activeWhatsAppProvider = new MockWhatsAppProvider();
      break;
  }

  return activeWhatsAppProvider;
}

export function setCustomWhatsAppProviderForTest(provider: WhatsAppProvider | null): void {
  activeWhatsAppProvider = provider;
}
