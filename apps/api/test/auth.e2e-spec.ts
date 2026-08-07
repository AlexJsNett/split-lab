import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  cleanDatabase,
  createTestApp,
  createTestProject,
} from './support/test-app';

describe('Auth guards (e2e)', () => {
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

  it('401s a protected route with no x-api-key header at all', async () => {
    await request(app.getHttpServer()).get('/projects').expect(401);
  });

  it('401s a protected route with an API key that matches no project', async () => {
    await request(app.getHttpServer())
      .get('/projects')
      .set('x-api-key', 'not-a-real-key')
      .expect(401);
  });

  it('403s when a valid key is used against a different project than it owns', async () => {
    const owner = await createTestProject(app, 'Owner');
    const intruder = await createTestProject(app, 'Intruder');

    await request(app.getHttpServer())
      .get(`/projects/${owner.id}`)
      .set('x-api-key', intruder.apiKey)
      .expect(403);
  });

  it('403s the ManageVariantsController special case (no :projectId in the URL) the same way', async () => {
    const owner = await createTestProject(app, 'Owner');
    const intruder = await createTestProject(app, 'Intruder');

    const experimentResponse = await request(app.getHttpServer())
      .post(`/projects/${owner.id}/experiments`)
      .set('x-api-key', owner.apiKey)
      .send({ name: 'Owner Experiment' })
      .expect(201);
    const experiment = experimentResponse.body as { id: string };

    await request(app.getHttpServer())
      .post(`/experiments/${experiment.id}/variants`)
      .set('x-api-key', intruder.apiKey)
      .send({ key: 'control', weight: 100 })
      .expect(403);
  });

  it('200s when the key genuinely owns the project', async () => {
    const project = await createTestProject(app, 'Owner');

    await request(app.getHttpServer())
      .get(`/projects/${project.id}`)
      .set('x-api-key', project.apiKey)
      .expect(200);
  });
});
