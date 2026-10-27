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

export const verifyAdminOtpSchema = z.object({
  countryCode: z.string().optional(),
  mobileNumber: z.string().min(4, 'Mobile number must be at least 4 digits'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
});

export const updateProfileSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  mobileNumber: z
    .never({ invalid_type_error: 'Mobile number cannot be changed here. It requires phone verification.' })
    .optional(),
  role: z.never({ invalid_type_error: 'Role cannot be modified' }).optional(),
  roleId: z.never({ invalid_type_error: 'Role cannot be modified' }).optional(),
});
