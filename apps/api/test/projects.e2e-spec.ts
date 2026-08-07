import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  cleanDatabase,
  createTestApp,
  createTestProject,
} from './support/test-app';

describe('Projects (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  it('POST /projects is public — no API key needed, returns the raw key exactly once', async () => {
    const response = await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'My Project' })
      .expect(201);

    expect(response.body).toMatchObject({ name: 'My Project' });
    const body = response.body as { apiKey: string };
    expect(body.apiKey).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty('apiKeyHash');
  });

  it('POST /projects rejects an unknown field (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'X', apiKeyHash: 'sneaky' })
      .expect(400);
  });

  it("full CRUD lifecycle scoped to the caller's own project", async () => {
    const project = await createTestProject(app, 'Lifecycle Project');

    await request(app.getHttpServer())
      .get('/projects')
      .set('x-api-key', project.apiKey)
      .expect(200)
      .expect([{ id: project.id, name: 'Lifecycle Project' }]);

    await request(app.getHttpServer())
      .get(`/projects/${project.id}`)
      .set('x-api-key', project.apiKey)
      .expect(200)
      .expect({ id: project.id, name: 'Lifecycle Project' });

    await request(app.getHttpServer())
      .patch(`/projects/${project.id}`)
      .set('x-api-key', project.apiKey)
      .send({ name: 'Renamed' })
      .expect(200)
      .expect({ id: project.id, name: 'Renamed' });

    await request(app.getHttpServer())
      .delete(`/projects/${project.id}`)
      .set('x-api-key', project.apiKey)
      .expect(204);

    // The deleted project's row is gone, so its own API key no longer
    // resolves — ApiKeyGuard itself rejects it before the controller runs.
    await request(app.getHttpServer())
      .get(`/projects/${project.id}`)
      .set('x-api-key', project.apiKey)
      .expect(401);
  });
});
