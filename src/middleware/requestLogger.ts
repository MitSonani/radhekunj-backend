import { NextFunction, Request, Response } from 'express';
import { createRequestLoggerMeta, logger } from '../shared/utils/logger.js';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const meta = {
      ...createRequestLoggerMeta(req),
      status: res.statusCode,
      durationMs: duration,
    };

    if (res.statusCode >= 500) {
      logger.error('Request completed with server error', meta);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', meta);
    } else {
      logger.info('Request completed', meta);
    }
  });

  next();
}
