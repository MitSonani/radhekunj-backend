export class AppError extends Error {
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly context?: Record<string, unknown>;

  constructor(
    statusCode: number,
    message: string,
    options?: {
      isOperational?: boolean;
      context?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = options?.isOperational ?? true;
    this.context = options?.context;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', context?: Record<string, unknown>) {
    super(422, message, { context });
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(429, message);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
