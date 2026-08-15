import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.CORS_ORIGIN ??= 'http://localhost:3001';
