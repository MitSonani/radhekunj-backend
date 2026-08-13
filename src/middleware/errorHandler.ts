import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import createHttpError, { HttpError } from 'http-errors';
import { AppError } from '../shared/errors/appError.js';
import { isProduction } from '../config/env.js';
import { logger } from '../shared/utils/logger.js';
import { ErrorResponse } from '../shared/types/index.js';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(createHttpError(404, 'Route not found'));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.id;

  if (err instanceof AppError) {
    logError(err, req, err.statusCode);

    const response: ErrorResponse = {
      success: false,
      message: err.message,
      requestId,
    };

    if (!isProduction && err.context) {
      response.details = err.context;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  if (err instanceof ZodError) {
    logError(err, req, 422);

    const response: ErrorResponse = {
      success: false,
      message: 'Validation failed',
      requestId,
    };

    if (!isProduction) {
      response.details = err.issues.map((issue) => ({
        field: issue.path.join('.') || 'root',
        message: issue.message,
      }));
    }

    res.status(422).json(response);
    return;
  }

  if (createHttpError.isHttpError(err)) {
    logError(err, req, err.statusCode);

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      requestId,
    } satisfies ErrorResponse);
    return;
  }

  logError(err, req, 500);

  res.status(500).json({
    success: false,
    message: isProduction ? 'Internal server error' : getSafeErrorMessage(err),
    requestId,
    ...(!isProduction && err instanceof Error && err.stack ? { stack: err.stack } : {}),
  } satisfies ErrorResponse & { stack?: string });
}

function logError(err: unknown, req: Request, statusCode: number): void {
  const meta = {
    requestId: req.id,
    method: req.method,
    endpoint: req.originalUrl,
    statusCode,
    error:
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { message: String(err) },
  };

  if (statusCode >= 500) {
    logger.error('Unhandled error', meta);
  } else {
    logger.warn('Request error', meta);
  }
}

function getSafeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  return 'An unexpected error occurred';
}

export type { HttpError };
