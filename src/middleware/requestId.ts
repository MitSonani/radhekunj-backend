import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.trim().length > 0 ? incomingId : uuidv4();

  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
