import jwt from 'jsonwebtoken';
import { prisma } from '../../database/prisma.js';
import { AppError, NotFoundError, RateLimitError } from '../../shared/errors/appError.js';
import { appConfig } from '../../config/index.js';
import {
  setOtp,
  getOtp,
  deleteOtp,
  acquireOtpSendLock,
  releaseOtpSendLock,
  isIdentifierLocked,
  recordFailedOtpAttempt,
  clearOtpAttempts,
} from '../../shared/utils/otpStore.js';
import { addNotificationJob } from '../../shared/utils/queue.js';
import { isProduction } from '../../config/env.js';
import { OTP, ROLES } from '../../shared/constants/index.js';

export const ADMIN_NOT_FOUND_MESSAGE = 'No admin found';

interface SendOtpDetails {
  countryCode?: string;
  mobileNumber: string;
}

interface VerifyOtpDetails {
  name?: string;
  countryCode?: string;
  mobileNumber: string;
}

const AUTH_USER_SELECT = {
  id: true,
  name: true,
  role: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

type AuthUser = {
  id: string;
  name: string;
  role: { id: string; name: string } | null;
};

function isAdminRoleName(roleName: string | null | undefined): boolean {
  return roleName?.trim().toLowerCase() === ROLES.ADMIN;
}

async function findAdminByMobileNumber(
  mobileNumber: string,
  countryCode?: string,
): Promise<AuthUser | null> {
  const candidates = [...new Set([mobileNumber, `${countryCode || ''}${mobileNumber}`].filter(Boolean))];

  const user = await prisma.user.findFirst({
    where: { mobileNumber: { in: candidates } },
    select: AUTH_USER_SELECT,
  });

  if (!user || !isAdminRoleName(user.role?.name)) {
    return null;
  }

  return user;
}

function issueSessionToken(userId: string): string {
  return jwt.sign({ id: userId }, appConfig.jwtSecret || '', {
    expiresIn: '1d',
  });
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
 * Enforces attempt tracking and temporary lockout against brute force.
 * @returns The logged-in/signed-up user and their JWT session token.
 */
export async function verifyOtp(
  identifier: string,
  otp: string,
  details: VerifyOtpDetails,
) {
  const lockStatus = await isIdentifierLocked(identifier);
  if (lockStatus.locked) {
    const mins = Math.ceil((lockStatus.retryAfterSeconds ?? 900) / 60);
    throw new AppError(
      429,
      `Too many failed verification attempts. Account is locked. Please try again in ${mins} minutes.`,
    );
  }

  const cachedOtp = await getOtp(identifier);

  if (!cachedOtp || cachedOtp !== otp) {
    const attemptResult = await recordFailedOtpAttempt(identifier);
    if (attemptResult.maxReached) {
      throw new AppError(
        429,
        'Maximum verification attempts exceeded. Account is locked for 15 minutes.',
      );
    }
    throw new AppError(400, 'Invalid or expired OTP');
  }

  // Delete OTP and clear attempts on successful verification
  await deleteOtp(identifier);
  await clearOtpAttempts(identifier);

  // Find user by unique mobile number
  let user = await prisma.user.findUnique({
    where: { mobileNumber: details.mobileNumber },
    select: AUTH_USER_SELECT,
  });

  // If user does not exist, auto-register them
  if (!user) {
    // Check if the default 'customer' role exists
    let customerRole = await prisma.role.findFirst({
      where: {
        name: {
          equals: ROLES.CUSTOMER,
          mode: 'insensitive',
        },
      },
    });

    // Create the 'customer' role if not exists
    if (!customerRole) {
      customerRole = await prisma.role.create({
        data: { name: ROLES.CUSTOMER },
      });
    }

    const newUser = await prisma.user.create({
      data: {
        name: details.name || 'Customer User',
        mobileNumber: details.mobileNumber,
        countryCode: details.countryCode || null,
        roleId: customerRole.id,
      },
      select: AUTH_USER_SELECT,
    });

    user = newUser;
  }

  return {
    user,
    token: issueSessionToken(user.id),
  };
}

/**
 * Admin login OTP. Sends a code only when an admin already exists for the number.
 * Never creates users.
 */
export async function sendAdminOtp(
  identifier: string,
  details: SendOtpDetails,
): Promise<string | undefined> {
  const admin = await findAdminByMobileNumber(details.mobileNumber, details.countryCode);
  if (!admin) {
    throw new NotFoundError(ADMIN_NOT_FOUND_MESSAGE);
  }

  return sendOtp(identifier, details);
}

/**
 * Admin login OTP verification. Existing admins only — never registers a user.
 */
export async function verifyAdminOtp(
  identifier: string,
  otp: string,
  details: Pick<VerifyOtpDetails, 'countryCode' | 'mobileNumber'>,
) {
  const lockStatus = await isIdentifierLocked(identifier);
  if (lockStatus.locked) {
    const mins = Math.ceil((lockStatus.retryAfterSeconds ?? 900) / 60);
    throw new AppError(
      429,
      `Too many failed verification attempts. Account is locked. Please try again in ${mins} minutes.`,
    );
  }

  const cachedOtp = await getOtp(identifier);

  if (!cachedOtp || cachedOtp !== otp) {
    const attemptResult = await recordFailedOtpAttempt(identifier);
    if (attemptResult.maxReached) {
      throw new AppError(
        429,
        'Maximum verification attempts exceeded. Account is locked for 15 minutes.',
      );
    }
    throw new AppError(400, 'Invalid or expired OTP');
  }

  const admin = await findAdminByMobileNumber(details.mobileNumber, details.countryCode);
  if (!admin) {
    throw new NotFoundError(ADMIN_NOT_FOUND_MESSAGE);
  }

  await deleteOtp(identifier);
  await clearOtpAttempts(identifier);

  return {
    user: admin,
    token: issueSessionToken(admin.id),
  };
}


export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      mobileNumber: true,
      countryCode: true,
      role: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
}

export async function updateProfile(userId: string, input: { name: string }) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new NotFoundError('User not found');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name.trim(),
    },
    select: {
      id: true,
      name: true,
      mobileNumber: true,
      countryCode: true,
      role: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  return updated;
}
