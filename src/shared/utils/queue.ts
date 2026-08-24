import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from './logger.js';

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
 * Falls back to direct mock printing if Redis connection is not configured.
 */
export async function addNotificationJob(
  name: string,
  data: { identifier: string; otp: string; countryCode?: string },
): Promise<void> {
  if (notificationQueue) {
    try {
      await notificationQueue.add(name, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      });
      logger.info(`Notification job queued: ${name}`, { identifier: data.identifier });
      return;
    } catch (error) {
      logger.error('Failed to queue job in Redis, falling back to mock output', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Fallback if Redis is unconfigured or failed to write
  logger.info(
    `[MOCK QUEUE FALLBACK] Processing ${name} immediately (Redis offline/unconfigured): Sent OTP ${data.otp} to ${data.countryCode || ''}${data.identifier}`,
  );
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

        // Simulate sending SMS/WhatsApp
        logger.info(`[SMS/WhatsApp WORKER] Sending OTP ${otp} to ${countryCode || ''}${identifier}`);

        // Simulating some processing delay (e.g. API request latency)
        await new Promise((resolve) => setTimeout(resolve, 500));
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
