import 'dotenv/config';
import { createServer, Server } from 'node:http';
import { createApp } from './app.js';
import { appConfig } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './database/prisma.js';
import { connectRedis, disconnectRedis } from './database/redis.js';
import { logger } from './shared/utils/logger.js';
import { startNotificationWorker, stopNotificationWorker } from './shared/utils/queue.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let server: Server | null = null;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  await connectDatabase();
  await connectRedis();
  startNotificationWorker();

  const app = createApp();
  server = createServer(app);

  server.listen(appConfig.port, () => {
    logger.info(`Server listening on port ${appConfig.port}`, {
      nodeEnv: appConfig.nodeEnv,
      port: appConfig.port,
    });
  });
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
      logger.info('HTTP server closed');
    }

    await stopNotificationWorker();
    await disconnectRedis();
    await disconnectDatabase();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

function registerProcessHandlers(): void {
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    void shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    void shutdown('unhandledRejection');
  });
}

registerProcessHandlers();

startServer().catch((error: unknown) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
