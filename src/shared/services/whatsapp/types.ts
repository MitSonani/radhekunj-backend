export interface SendWhatsAppOtpOptions {
  to: string;
  otp: string;
  countryCode?: string;
}

export interface SendWhatsAppResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface WhatsAppProvider {
  name: string;
  sendOtp(options: SendWhatsAppOtpOptions): Promise<SendWhatsAppResult>;
}

export function maskPhoneNumber(phone: string): string {
  const clean = phone.trim();
  if (clean.length < 6) return '****';
  return clean.slice(0, 3) + '****' + clean.slice(-3);
}
