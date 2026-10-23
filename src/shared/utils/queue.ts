import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from './logger.js';
import { getSmsProvider, maskPhoneNumber } from '../services/sms/index.js';

const QUEUE_NAME = 'notification-queue';

let notificationQueue: Queue | null = null;
let notificationWorker: Worker | null = null;

/**
 * Creates a dedicated connection for BullMQ.
 * BullMQ requires dedicated connections (cannot be shared with general command clients)
 * because workers and events block.
 */
function createBullRedisConnection(): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

const queueConnection = createBullRedisConnection();
if (queueConnection) {
  notificationQueue = new Queue(QUEUE_NAME, {
    connection: queueConnection,
  });
}

/**
 * Adds a notification job to the background queue.
 * Falls back to direct provider execution if Redis connection is not configured.
 */
export async function addNotificationJob(
  name: string,
  data: { identifier: string; otp: string; countryCode?: string },
): Promise<void> {
  const maskedPhone = maskPhoneNumber(`${data.countryCode || ''}${data.identifier}`);

  if (notificationQueue) {
    try {
      await notificationQueue.add(name, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      });
      logger.info(`Notification job queued: ${name}`, { to: maskedPhone });
      return;
    } catch (error) {
      logger.error('Failed to queue job in Redis, falling back to direct delivery', {
        to: maskedPhone,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback if Redis is unconfigured or failed to write: dispatch directly
  if (name === 'send_otp') {
    const smsProvider = getSmsProvider();
    const result = await smsProvider.sendOtp({
      to: data.identifier,
      otp: data.otp,
      countryCode: data.countryCode,
    });

    if (!result.success) {
      logger.error('[NOTIFICATION FALLBACK] Failed to dispatch OTP', {
        to: maskedPhone,
        error: result.error,
      });
      throw new Error(`Failed to deliver OTP: ${result.error}`);
    }

    logger.info('[NOTIFICATION FALLBACK] Dispatched OTP via provider', {
      to: maskedPhone,
      provider: result.provider,
    });
  }
}

/**
 * Starts the notification worker to process queued SMS/WhatsApp jobs.
 */
export function startNotificationWorker(): void {
  if (!env.REDIS_URL) {
    logger.info('Notification worker not started: Redis not configured');
    return;
  }

  if (notificationWorker) {
    return;
  }

  const workerConnection = createBullRedisConnection();
  if (!workerConnection) {
    return;
  }

  notificationWorker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === 'send_otp') {
        const { identifier, otp, countryCode } = job.data as {
          identifier: string;
          otp: string;
          countryCode?: string;
        };

        const masked = maskPhoneNumber(`${countryCode || ''}${identifier}`);
        logger.info('[SMS WORKER] Processing OTP delivery job', { to: masked });

        const smsProvider = getSmsProvider();
        const result = await smsProvider.sendOtp({
          to: identifier,
          otp,
          countryCode,
        });

        if (!result.success) {
          logger.error('[SMS WORKER] Provider failed to deliver OTP', {
            to: masked,
            error: result.error,
          });
          throw new Error(`SMS Provider error: ${result.error}`);
        }

        logger.info('[SMS WORKER] OTP successfully delivered via provider', {
          to: masked,
          provider: result.provider,
          messageId: result.messageId,
        });
      }
    },
    {
      connection: workerConnection,
    },
  );

  notificationWorker.on('completed', (job) => {
    logger.info(`Job completed: ${job.id}`);
  });

  notificationWorker.on('failed', (job, err) => {
    logger.error(`Job failed: ${job?.id}`, { error: err.message });
  });

  logger.info('Notification worker started');
}

/**
 * Gracefully shuts down the worker.
 */
export async function stopNotificationWorker(): Promise<void> {
  if (notificationWorker) {
    await notificationWorker.close();
    notificationWorker = null;
    logger.info('Notification worker stopped');
  }
}
