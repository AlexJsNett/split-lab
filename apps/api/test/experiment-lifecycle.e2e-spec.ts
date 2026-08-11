import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  cleanDatabase,
  createTestApp,
  createTestProject,
  readPublishedEvents,
  seedEvents,
  TestProject,
} from './support/test-app';

interface VariantResult {
  variantId: string;
  key: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
}

// D8 (M10 plan): this suite tests the API's half of the contract — "the API
// publishes a correct message" — against a real broker, with no worker
// process running. seedEvents() stands in for what apps/event-processor
// would otherwise have written; the worker's own half of the contract
// ("the worker persists one correctly") is covered by
// apps/event-processor/test/*.e2e-spec.ts instead. The one thing this split
// deliberately does not cover — the live cross-service golden path with both
// processes running — is deferred to M13 (see messaging.md).
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

  async function startExperiment(experimentId: string) {
    await request(app.getHttpServer())
      .patch(`/projects/${project.id}/experiments/${experimentId}`)
      .set('x-api-key', project.apiKey)
      .send({ status: 'running' })
      .expect(200);
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

  it('assign is deterministic and publishes a well-formed exposure event per call', async () => {
    const experiment = await createExperiment();
    await createVariant(experiment.id, 'control', 50);
    await createVariant(experiment.id, 'treatment', 50);
    await startExperiment(experiment.id);

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

    // assign() publishes a fresh exposure on every call (no dedup) — two
    // calls above, two messages expected on the queue.
    const [firstMessage, secondMessage] = await readPublishedEvents(app, 2);
    expect(firstMessage).toEqual({
      experimentId: experiment.id,
      variantId: firstAssign.id,
      userId: 'user-1',
      type: 'exposure',
    });
    expect(secondMessage).toEqual({
      experimentId: experiment.id,
      variantId: secondAssign.id,
      userId: 'user-1',
      type: 'exposure',
    });
  });

  it("conversions publishes a conversion event carrying the seeded exposure's variantId", async () => {
    const experiment = await createExperiment();
    const control = await createVariant(experiment.id, 'control', 100);
    await startExperiment(experiment.id);

    // No worker runs in this suite (D8) — seed the exposure row
    // findExposureWithRetry needs directly, the same row apps/event-processor
    // would otherwise have written.
    await seedEvents(app, [
      {
        experimentId: experiment.id,
        variantId: control.id,
        userId: 'user-1',
        type: 'exposure',
      },
    ]);

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/experiments/${experiment.id}/conversions`)
      .set('x-api-key', project.apiKey)
      .send({ userId: 'user-1' })
      .expect(201)
      .expect((res) => {
        const body = res.body as { variantId: string; type: string };
        expect(body.variantId).toBe(control.id);
        expect(body.type).toBe('conversion');
      });

    const [message] = await readPublishedEvents(app, 1);
    expect(message).toEqual({
      experimentId: experiment.id,
      variantId: control.id,
      userId: 'user-1',
      type: 'conversion',
    });
  });

  it('conversions rejects a user with no recorded exposure', async () => {
    const experiment = await createExperiment();
    await createVariant(experiment.id, 'control', 100);
    await startExperiment(experiment.id);

    // never exposed -> no variant to attribute the conversion to
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/experiments/${experiment.id}/conversions`)
      .set('x-api-key', project.apiKey)
      .send({ userId: 'never-exposed' })
      .expect(400);
  });

  it('results aggregates seeded events per variant, zero-filling variants with no events', async () => {
    const experiment = await createExperiment();
    const control = await createVariant(experiment.id, 'control', 50);
    const treatment = await createVariant(experiment.id, 'treatment', 50);
    await startExperiment(experiment.id);

    // /results is a pure read endpoint straight off Postgres — seeding rows
    // directly (no worker in this suite) is a faithful test of it (D8).
    await seedEvents(app, [
      {
        experimentId: experiment.id,
        variantId: control.id,
        userId: 'user-1',
        type: 'exposure',
      },
      {
        experimentId: experiment.id,
        variantId: control.id,
        userId: 'user-1',
        type: 'conversion',
      },
      {
        experimentId: experiment.id,
        variantId: control.id,
        userId: 'user-2',
        type: 'exposure',
      },
    ]);

    const resultsResponse = await request(app.getHttpServer())
      .get(`/projects/${project.id}/experiments/${experiment.id}/results`)
      .set('x-api-key', project.apiKey)
      .expect(200);
    const results = resultsResponse.body as VariantResult[];

    expect(results).toHaveLength(2);

    const controlResult = results.find(
      (variant) => variant.variantId === control.id,
    );
    expect(controlResult?.exposures).toBe(2);
    expect(controlResult?.conversions).toBe(1);
    expect(controlResult?.conversionRate).toBeGreaterThan(0);

    // both variants appear even though treatment has zero events —
    // get-results zero-fills, it doesn't silently drop unused variants.
    const treatmentResult = results.find(
      (variant) => variant.variantId === treatment.id,
    );
    expect(treatmentResult).toEqual({
      variantId: treatment.id,
      key: 'treatment',
      exposures: 0,
      conversions: 0,
      conversionRate: 0,
    });
  });
});
