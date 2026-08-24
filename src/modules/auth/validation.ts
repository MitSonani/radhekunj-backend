import { z } from 'zod';

export const sendOtpSchema = z.object({
  countryCode: z.string().min(1, 'Country code cannot be empty').optional(),
  mobileNumber: z.string().min(4, 'Mobile number must be at least 4 digits'),
});

export const verifyOtpSchema = z.object({
  countryCode: z.string().optional(),
  mobileNumber: z.string().min(4, 'Mobile number must be at least 4 digits'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  name: z.string().trim().min(1, 'Name cannot be empty').optional(),
});
