import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  cleanDatabase,
  createTestApp,
  createTestProject,
  TestProject,
  waitForQueueDrain,
} from './support/test-app';

interface VariantResult {
  variantId: string;
  key: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
}

describe('Experiment lifecycle: variants -> assign -> conversion -> results (e2e)', () => {
  let app: INestApplication<App>;
  let project: TestProject;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    project = await createTestProject(app);
  });

  async function createExperiment(name = 'Checkout test') {
    const response = await request(app.getHttpServer())
      .post(`/projects/${project.id}/experiments`)
      .set('x-api-key', project.apiKey)
      .send({ name })
      .expect(201);
    return response.body as { id: string; status: string };
  }

  async function createVariant(
    experimentId: string,
    key: string,
    weight: number,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/experiments/${experimentId}/variants`)
      .set('x-api-key', project.apiKey)
      .send({ key, weight })
      .expect(201);
    return response.body as { id: string; key: string };
  }

  it('assign rejects a non-running experiment', async () => {
    const experiment = await createExperiment();

    await request(app.getHttpServer())
      .get(`/projects/${project.id}/experiments/${experiment.id}/assign`)
      .set('x-api-key', project.apiKey)
      .query({ userId: 'user-1' })
      .expect(400);
  });

  it('refuses to move an experiment to running when variant weights do not sum to 100', async () => {
    const experiment = await createExperiment();
    await createVariant(experiment.id, 'control', 40);

    await request(app.getHttpServer())
      .patch(`/projects/${project.id}/experiments/${experiment.id}`)
      .set('x-api-key', project.apiKey)
      .send({ status: 'running' })
      .expect(400);
  });

  it('full golden path: assign is deterministic, feeds conversion, feeds results', async () => {
    const experiment = await createExperiment();
    const control = await createVariant(experiment.id, 'control', 50);
    await createVariant(experiment.id, 'treatment', 50);

    await request(app.getHttpServer())
      .patch(`/projects/${project.id}/experiments/${experiment.id}`)
      .set('x-api-key', project.apiKey)
      .send({ status: 'running' })
      .expect(200);

    const firstAssignResponse = await request(app.getHttpServer())
      .get(`/projects/${project.id}/experiments/${experiment.id}/assign`)
      .set('x-api-key', project.apiKey)
      .query({ userId: 'user-1' })
      .expect(200);
    const firstAssign = firstAssignResponse.body as { id: string };

    const secondAssignResponse = await request(app.getHttpServer())
      .get(`/projects/${project.id}/experiments/${experiment.id}/assign`)
      .set('x-api-key', project.apiKey)
      .query({ userId: 'user-1' })
      .expect(200);
    const secondAssign = secondAssignResponse.body as { id: string };

    // deterministic bucketing: same userId + same experiment -> same variant
    expect(secondAssign.id).toBe(firstAssign.id);
    const assignedVariantId = firstAssign.id;

    // a second, distinct user, exposed but never converting
    await request(app.getHttpServer())
      .get(`/projects/${project.id}/experiments/${experiment.id}/assign`)
      .set('x-api-key', project.apiKey)
      .query({ userId: 'user-2' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/experiments/${experiment.id}/conversions`)
      .set('x-api-key', project.apiKey)
      .send({ userId: 'user-1' })
      .expect(201)
      .expect((res) => {
        const body = res.body as { variantId: string; type: string };
        expect(body.variantId).toBe(assignedVariantId);
        expect(body.type).toBe('conversion');
      });

    // never exposed -> no variant to attribute the conversion to
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/experiments/${experiment.id}/conversions`)
      .set('x-api-key', project.apiKey)
      .send({ userId: 'never-exposed' })
      .expect(400);

    // /results reads straight from Postgres — wait for the worker to drain
    // the exposure/conversion jobs queued above before asserting on it.
    await waitForQueueDrain(app);

    const resultsResponse = await request(app.getHttpServer())
      .get(`/projects/${project.id}/experiments/${experiment.id}/results`)
      .set('x-api-key', project.apiKey)
      .expect(200);
    const results = resultsResponse.body as VariantResult[];

    expect(results).toHaveLength(2);
    const totalExposures = results.reduce(
      (sum, variant) => sum + variant.exposures,
      0,
    );
    const totalConversions = results.reduce(
      (sum, variant) => sum + variant.conversions,
      0,
    );
    // assign() logs a fresh exposure on every call, even for a repeat userId
    // (no dedup) — user-1 was assigned twice above (first + second), user-2 once.
    expect(totalExposures).toBe(3);
    expect(totalConversions).toBe(1); // only user-1 converted

    const assignedVariantResult = results.find(
      (variant) => variant.variantId === assignedVariantId,
    );
    expect(assignedVariantResult?.conversions).toBe(1);
    expect(assignedVariantResult?.conversionRate).toBeGreaterThan(0);

    // both variants appear even if one of them got zero events —
    // get-results zero-fills, it doesn't silently drop unused variants.
    expect(results.map((variant) => variant.variantId)).toEqual(
      expect.arrayContaining([control.id]),
    );
  });
});
