import { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { WEBHOOK_CONFIG } from '@/features/push-results/webhook.config';
import {
  cleanDatabase,
  createTestApp,
  createTestProject,
  seedEvents,
  TestProject,
} from './support/test-app';
import { startWebhookStub, WebhookStub } from './support/webhook-stub';

// Hits a local stub server, not real webhook.site — a deterministic,
// scriptable substitute for the real target, which can't be forced into
// specific responses on demand (see the manual/live check in
// third-party-integrations.md for the real webhook.site round-trip).
describe('Push results webhook (e2e)', () => {
  let app: INestApplication<App>;
  let project: TestProject;
  let stub: WebhookStub;

  beforeAll(async () => {
    stub = await startWebhookStub();
    app = await createTestApp((builder) =>
      builder.overrideProvider(WEBHOOK_CONFIG).useValue({
        url: stub.url,
        secret: 'test-secret',
        timeoutMs: 2000,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
    await stub.close();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    project = await createTestProject(app);
    stub.requests.length = 0;
  });

  async function createExperiment(name = 'Push test') {
    const response = await request(app.getHttpServer())
      .post(`/projects/${project.id}/experiments`)
      .set('x-api-key', project.apiKey)
      .send({ name })
      .expect(201);
    return response.body as { id: string };
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
    return response.body as { id: string };
  }

  it('signs and delivers results, then short-circuits an identical second push', async () => {
    const experiment = await createExperiment();
    const control = await createVariant(experiment.id, 'control', 100);

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
    ]);

    const firstResponse = await request(app.getHttpServer())
      .post(`/projects/${project.id}/experiments/${experiment.id}/results/push`)
      .set('x-api-key', project.apiKey)
      .expect(201);

    expect(firstResponse.body).toMatchObject({
      status: 'delivered',
      responseStatus: 200,
    });
    expect(stub.requests).toHaveLength(1);

    const [captured] = stub.requests;
    const timestamp = captured.headers['x-splitlab-timestamp'] as string;
    const idempotencyKey = captured.headers[
      'x-splitlab-idempotency-key'
    ] as string;
    const signature = captured.headers['x-splitlab-signature'] as string;
    const expectedSignature = `sha256=${createHmac('sha256', 'test-secret')
      .update(`${timestamp}.${captured.body}`)
      .digest('hex')}`;
    expect(signature).toEqual(expectedSignature);
    expect(idempotencyKey).toBeTruthy();

    const payload = JSON.parse(captured.body) as { variantId: string }[];
    expect(payload.find((v) => v.variantId === control.id)).toBeDefined();

    const secondResponse = await request(app.getHttpServer())
      .post(`/projects/${project.id}/experiments/${experiment.id}/results/push`)
      .set('x-api-key', project.apiKey)
      .expect(201);

    expect(secondResponse.body).toEqual({ status: 'duplicate' });
    expect(stub.requests).toHaveLength(1); // no new request landed at the stub
  });

  it('404s when the experiment does not exist, with no request reaching the stub', async () => {
    await request(app.getHttpServer())
      .post(
        `/projects/${project.id}/experiments/00000000-0000-0000-0000-000000000000/results/push`,
      )
      .set('x-api-key', project.apiKey)
      .expect(404);

    expect(stub.requests).toHaveLength(0);
  });
});
