import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  cleanDatabase,
  createTestApp,
  createTestProject,
} from './support/test-app';

describe('Feature flags (e2e)', () => {
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

  it('full CRUD lifecycle, nested under the owning project', async () => {
    const project = await createTestProject(app);

    const created = await request(app.getHttpServer())
      .post(`/projects/${project.id}/flags`)
      .set('x-api-key', project.apiKey)
      .send({ key: 'new-checkout', rolloutPercent: 50 })
      .expect(201);
    expect(created.body).toMatchObject({
      key: 'new-checkout',
      enabled: false,
      rolloutPercent: 50,
    });
    const flag = created.body as { id: string; key: string };
    const flagId = flag.id;

    await request(app.getHttpServer())
      .get(`/projects/${project.id}/flags`)
      .set('x-api-key', project.apiKey)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveLength(1);
      });

    await request(app.getHttpServer())
      .get(`/projects/${project.id}/flags/${flagId}`)
      .set('x-api-key', project.apiKey)
      .expect(200)
      .expect((res) => {
        const body = res.body as { key: string };
        expect(body.key).toBe('new-checkout');
      });

    await request(app.getHttpServer())
      .patch(`/projects/${project.id}/flags/${flagId}`)
      .set('x-api-key', project.apiKey)
      .send({ enabled: true })
      .expect(200)
      .expect((res) => {
        const body = res.body as { enabled: boolean };
        expect(body.enabled).toBe(true);
      });

    await request(app.getHttpServer())
      .delete(`/projects/${project.id}/flags/${flagId}`)
      .set('x-api-key', project.apiKey)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/projects/${project.id}/flags/${flagId}`)
      .set('x-api-key', project.apiKey)
      .expect(404);
  });

  it("a project cannot list or reach another project's flags", async () => {
    const owner = await createTestProject(app, 'Owner');
    const intruder = await createTestProject(app, 'Intruder');

    await request(app.getHttpServer())
      .post(`/projects/${owner.id}/flags`)
      .set('x-api-key', owner.apiKey)
      .send({ key: 'owner-flag' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/projects/${owner.id}/flags`)
      .set('x-api-key', intruder.apiKey)
      .expect(403);
  });
});
