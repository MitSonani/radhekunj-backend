import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.CORS_ORIGIN ??= 'http://localhost:3001';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.AWS_REGION ??= 'ap-south-1';
process.env.AWS_ACCESS_KEY_ID ??= 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test-secret-key';
process.env.AWS_S3_BUCKET ??= 'test-category-images';
