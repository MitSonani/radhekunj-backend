import { getRedisClient } from '../../database/redis.js';
import { logger } from './logger.js';

interface MemoryRecord {
  otp: string;
  expiresAt: number;
}

const inMemoryStore = new Map<string, MemoryRecord>();

/**
 * Saves an OTP for a given key (mobile number or email) with an expiration.
 * @param key Unique identifier (e.g. email or mobile).
 * @param otp The 6-digit OTP string.
 * @param ttlSeconds Time-to-live in seconds (default: 300 / 5 minutes).
 */
export async function setOtp(key: string, otp: string, ttlSeconds = 300): Promise<void> {
  const redis = getRedisClient();

  if (redis) {
    try {
      await redis.set(`otp:${key}`, otp, 'EX', ttlSeconds);
      return;
    } catch (error) {
      logger.error('Redis error storing OTP, falling back to memory', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback to in-memory store
  inMemoryStore.set(key, {
    otp,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Retrieves the OTP for a given key. Returns null if expired or missing.
 * @param key Unique identifier.
 */
export async function getOtp(key: string): Promise<string | null> {
  const redis = getRedisClient();

  if (redis) {
    try {
      return await redis.get(`otp:${key}`);
    } catch (error) {
      logger.error('Redis error retrieving OTP, falling back to memory', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback to in-memory store
  const record = inMemoryStore.get(key);
  if (!record) {
    return null;
  }

  if (Date.now() > record.expiresAt) {
    inMemoryStore.delete(key);
    return null;
  }

  return record.otp;
}

/**
 * Deletes the OTP for a given key (one-time verification).
 * @param key Unique identifier.
 */
export async function deleteOtp(key: string): Promise<void> {
  const redis = getRedisClient();

  if (redis) {
    try {
      await redis.del(`otp:${key}`);
      return;
    } catch (error) {
      logger.error('Redis error deleting OTP, falling back to memory', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  inMemoryStore.delete(key);
}
