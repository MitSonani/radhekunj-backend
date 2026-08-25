import { getRedisClient } from '../../database/redis.js';
import { logger } from './logger.js';

interface MemoryRecord {
  otp: string;
  expiresAt: number;
}

const inMemoryStore = new Map<string, MemoryRecord>();

/**
 * Tracks OTP send cooldown expiry timestamps for the in-memory fallback.
 * Key: `otp:send:{identifier}`, Value: expiresAt timestamp (ms).
 *
 * NOTE: This fallback is single-instance only. Multi-instance deployments
 * require Redis to share cooldown state across nodes.
 */
const inMemoryOtpSendLocks = new Map<string, number>();

const OTP_SEND_LOCK_PREFIX = 'otp:send:';

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

export interface AcquireOtpSendLockResult {
  acquired: boolean;
  retryAfterSeconds?: number;
}

/**
 * Attempts to atomically acquire a send-cooldown lock for the given identifier.
 *
 * Uses Redis `SET key value EX ttl NX` so only the first caller within the TTL
 * window succeeds. Concurrent callers — even across separate backend instances —
 * are safe because the operation is atomic at the Redis level.
 *
 * Falls back to an in-memory Map when Redis is unavailable (single-instance only).
 *
 * @param identifier Normalised phone identifier (e.g. "+919876543210").
 * @param ttlSeconds How long the lock should live (the cooldown window).
 * @returns `{ acquired: true }` when the lock was obtained, or
 *          `{ acquired: false, retryAfterSeconds }` when the cooldown is still active.
 */
export async function acquireOtpSendLock(
  identifier: string,
  ttlSeconds: number,
): Promise<AcquireOtpSendLockResult> {
  const key = `${OTP_SEND_LOCK_PREFIX}${identifier}`;
  const redis = getRedisClient();

  if (redis) {
    try {
      // Atomic: only sets the key when it does NOT already exist
      const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');

      if (result === 'OK') {
        return { acquired: true };
      }

      // Key already exists — read remaining TTL to report accurate wait time
      const ttl = await redis.ttl(key);
      return { acquired: false, retryAfterSeconds: ttl > 0 ? ttl : ttlSeconds };
    } catch (error) {
      logger.error('Redis error acquiring OTP send lock, falling back to memory', {
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // In-memory fallback — single-instance only; multi-instance requires Redis
  const now = Date.now();
  const expiresAt = inMemoryOtpSendLocks.get(key);

  if (expiresAt !== undefined && now < expiresAt) {
    const retryAfterSeconds = Math.ceil((expiresAt - now) / 1000);
    return { acquired: false, retryAfterSeconds };
  }

  inMemoryOtpSendLocks.set(key, now + ttlSeconds * 1000);
  return { acquired: true };
}

/**
 * Releases the OTP send-cooldown lock for the given identifier.
 *
 * Call this only when OTP generation/queuing has definitively failed so that
 * the user is not unnecessarily blocked for the full cooldown window.
 * Do NOT release if there is any chance the SMS was actually dispatched.
 *
 * @param identifier Normalised phone identifier.
 */
export async function releaseOtpSendLock(identifier: string): Promise<void> {
  const key = `${OTP_SEND_LOCK_PREFIX}${identifier}`;
  const redis = getRedisClient();

  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch (error) {
      logger.error('Redis error releasing OTP send lock, falling back to memory', {
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  inMemoryOtpSendLocks.delete(key);
}

/**
 * Clears all OTP send locks from both the in-memory store and Redis.
 * FOR TESTING USE ONLY — do not call in production code.
 */
export async function _clearOtpSendLocksForTest(): Promise<void> {
  inMemoryOtpSendLocks.clear();

  const redis = getRedisClient();
  if (redis) {
    try {
      const keys = await redis.keys(`${OTP_SEND_LOCK_PREFIX}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Best-effort cleanup — test isolation may be imperfect if Redis is unavailable
    }
  }
}
