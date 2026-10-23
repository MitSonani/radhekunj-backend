export interface SendOtpOptions {
  to: string;
  otp: string;
  countryCode?: string;
}

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface SmsProvider {
  name: string;
  sendOtp(options: SendOtpOptions): Promise<SendOtpResult>;
}

export function maskPhoneNumber(phone: string): string {
  const clean = phone.trim();
  if (clean.length < 6) return '****';
  return clean.slice(0, 3) + '****' + clean.slice(-3);
}
