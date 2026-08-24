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
  jwtSecret: env.JWT_SECRET,
  s3: {
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    bucket: env.AWS_S3_BUCKET,
    publicBaseUrl: env.AWS_S3_PUBLIC_BASE_URL,
  },
};
