import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodType } from 'zod';
import { ValidationError } from '../errors/appError.js';

type RequestSource = 'body' | 'query' | 'params';

export function validateRequest<T extends ZodType>(schema: T, source: RequestSource = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- raw input before validation
    const rawValue = req[source];
    const result = schema.safeParse(rawValue);

    if (!result.success) {
      next(formatZodError(result.error));
      return;
    }

    switch (source) {
      case 'body':
        // Express types req.body as any; Zod-validated data replaces it at the API boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- boundary sanitization
        req.body = result.data;
        break;
      case 'query':
        req.query = result.data as Request['query'];
        break;
      case 'params':
        req.params = result.data as Request['params'];
        break;
    }

    next();
  };
}

function formatZodError(error: ZodError): ValidationError {
  const details = error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
  }));

  return new ValidationError('Validation failed', { details });
}
