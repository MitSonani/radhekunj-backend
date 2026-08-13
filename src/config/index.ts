import { env, isProduction } from '../config/env.js';

export const appConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isProduction,
  corsOrigins: env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  bodyLimit: '1mb' as const,
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 100 : 1000,
  },
};
