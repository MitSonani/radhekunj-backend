import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../shared/utils/logger.js';

let redisClient: Redis | null = null;

/**
 * Returns a singleton Redis client when REDIS_URL is configured.
 * Returns null when Redis is not configured — business logic should not depend on Redis yet.
 */
export function getRedisClient(): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on('error', (error: Error) => {
      logger.error('Redis connection error', { error: error.message });
    });
  }

  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();

  if (!client) {
    logger.info('Redis not configured — skipping connection');
    return;
  }

  await client.connect();
  logger.info('Redis connected');
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }

  await redisClient.quit();
  redisClient = null;
  logger.info('Redis disconnected');
}

export async function checkRedisHealth(): Promise<boolean | null> {
  const client = getRedisClient();

  if (!client) {
    return null;
  }

  try {
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}
