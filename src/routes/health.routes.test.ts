import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Health endpoints', () => {
  const app = createApp();

  it('GET /health returns 200 with ok status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
    });
    expect(response.body).toHaveProperty('timestamp');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/v1 returns API info', async () => {
    const response = await request(app).get('/api/v1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'E-commerce API',
    });
  });

  it('GET /unknown returns 404', async () => {
    const response = await request(app).get('/unknown-route');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Route not found',
    });
  });
});
