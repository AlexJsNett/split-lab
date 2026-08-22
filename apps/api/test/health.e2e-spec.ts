import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './support/test-app';

describe('GET /health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with no x-api-key header — used as the compose/e2e readiness gate', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
