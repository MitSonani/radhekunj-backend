import jwt from 'jsonwebtoken';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../shared/errors/appError.js';
import { appConfig } from '../../config/index.js';
import { setOtp, getOtp, deleteOtp } from '../../shared/utils/otpStore.js';
import { addNotificationJob } from '../../shared/utils/queue.js';
import { isProduction } from '../../config/env.js';

interface SendOtpDetails {
  countryCode?: string;
  mobileNumber: string;
}

interface VerifyOtpDetails {
  name?: string;
  countryCode?: string;
  mobileNumber: string;
}

/**
 * Returns true if a user with the given mobile number is already registered.
 */
export async function userExists(mobileNumber: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { mobileNumber },
    select: { id: true },
  });
  return !!user;
}

/**
 * Generates an OTP, saves it in Redis, and enqueues a job in BullMQ to send it.
 * @returns The generated OTP in non-production environments to aid testing.
 */
export async function sendOtp(identifier: string, details: SendOtpDetails): Promise<string | undefined> {
  // Generate a random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Save OTP in the cache (valid for 5 minutes / 300 seconds)
  await setOtp(identifier, otp, 300);

  // Queue background notification job to send SMS/WhatsApp
  await addNotificationJob('send_otp', {
    identifier,
    otp,
    countryCode: details.countryCode,
  });

  // Return the OTP in test/development for easy API assertions/usage
  return isProduction ? undefined : otp;
}

/**
 * Verifies an OTP code. Automatically registers a user if they do not exist.
 * @returns The logged-in/signed-up user and their JWT session token.
 */
export async function verifyOtp(
  identifier: string,
  otp: string,
  details: VerifyOtpDetails,
) {
  const cachedOtp = await getOtp(identifier);

  if (!cachedOtp || cachedOtp !== otp) {
    throw new AppError(400, 'Invalid or expired OTP');
  }

  // Delete OTP upon successful verification (one-time use)
  await deleteOtp(identifier);

  // Find user by unique mobile number
  let user = await prisma.user.findUnique({
    where: { mobileNumber: details.mobileNumber },
    select: {
      id: true,
      name: true,
      role: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // If user does not exist, auto-register them
  if (!user) {
    // Check if the default 'customer' role exists
    let customerRole = await prisma.role.findFirst({
      where: {
        name: {
          equals: 'customer',
          mode: 'insensitive',
        },
      },
    });

    // Create the 'customer' role if not exists
    if (!customerRole) {
      customerRole = await prisma.role.create({
        data: { name: 'customer' },
      });
    }

    const newUser = await prisma.user.create({
      data: {
        name: details.name || 'Customer User',
        mobileNumber: details.mobileNumber,
        countryCode: details.countryCode || null,
        roleId: customerRole.id,
      },
      select: {
        id: true,
        name: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    user = newUser;
  }

  // Generate JWT token
  const token = jwt.sign({ id: user.id }, appConfig.jwtSecret || '', {
    expiresIn: '1d',
  });

  return {
    user,
    token,
  };
}
