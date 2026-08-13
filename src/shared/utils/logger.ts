import winston from 'winston';
import { isProduction } from '../../config/env.js';

const { combine, timestamp, json, colorize, printf } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${String(ts)} [${String(level)}]: ${String(message)}${metaStr}`;
  }),
);

const prodFormat = combine(timestamp(), json());

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
});

export function createRequestLoggerMeta(req: {
  id?: string;
  method: string;
  originalUrl: string;
}): Record<string, string> {
  return {
    requestId: req.id ?? 'unknown',
    method: req.method,
    endpoint: req.originalUrl,
  };
}
