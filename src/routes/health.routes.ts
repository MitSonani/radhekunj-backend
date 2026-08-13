import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../database/prisma.js';
import { checkRedisHealth } from '../database/redis.js';
import { HealthResponse, ReadinessResponse } from '../shared/types/index.js';
import { asyncHandler } from '../shared/utils/asyncHandler.js';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  res.status(200).json(response);
});

router.get(
  '/ready',
  asyncHandler(async (_req: Request, res: Response) => {
    const [databaseHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const checks: ReadinessResponse['checks'] = {
      database: databaseHealthy ? 'up' : 'down',
      redis: redisHealthy === null ? 'not_configured' : redisHealthy ? 'up' : 'down',
    };

    const isReady = databaseHealthy && (redisHealthy === null || redisHealthy);

    const response: ReadinessResponse = {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    };

    res.status(isReady ? 200 : 503).json(response);
  }),
);

export default router;
