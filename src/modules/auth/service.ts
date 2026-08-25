import jwt from 'jsonwebtoken';
import { prisma } from '../../database/prisma.js';
import { AppError, RateLimitError } from '../../shared/errors/appError.js';
import { appConfig } from '../../config/index.js';
import { setOtp, getOtp, deleteOtp, acquireOtpSendLock, releaseOtpSendLock } from '../../shared/utils/otpStore.js';
import { addNotificationJob } from '../../shared/utils/queue.js';
import { isProduction } from '../../config/env.js';
import { OTP } from '../../shared/constants/index.js';

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
 *
 * Enforces a per-identifier 60-second send cooldown atomically via Redis.
 * The rate-limit check happens BEFORE generating or storing the OTP so no
 * SMS is dispatched if the caller is within the cooldown window.
 *
 * @returns The generated OTP in non-production environments to aid testing.
 * @throws {RateLimitError} If the same identifier requests an OTP within the cooldown window.
 */
export async function sendOtp(identifier: string, details: SendOtpDetails): Promise<string | undefined> {
  // --- Rate limit: must be checked BEFORE OTP generation ---
  const lock = await acquireOtpSendLock(identifier, OTP.SEND_COOLDOWN_SECONDS);

  if (!lock.acquired) {
    throw new RateLimitError(
      'Please wait before requesting another OTP.',
      lock.retryAfterSeconds ?? OTP.SEND_COOLDOWN_SECONDS,
    );
  }

  try {
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
  } catch (error) {
    // Release the cooldown lock so the user can retry immediately when
    // we are certain the OTP was NOT dispatched (e.g. internal error before
    // the notification job was queued). Do NOT release if there is any chance
    // the SMS was already sent.
    await releaseOtpSendLock(identifier);
    throw error;
  }
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
