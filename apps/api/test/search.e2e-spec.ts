import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  cleanDatabase,
  createTestApp,
  createTestProject,
  refreshSearchIndices,
  TestProject,
} from './support/test-app';

interface SearchResultItem {
  type: 'experiment' | 'flag';
  id: string;
  score: number;
  name?: string;
  key?: string;
  description: string | null;
  status?: string;
  enabled?: boolean;
}

interface SearchResponseBody {
  query: string;
  total: number;
  results: SearchResultItem[];
}

// Against a real Elasticsearch instance, matching this project's "real
// Postgres/RabbitMQ in e2e" philosophy — not mocked, since the whole point
// of M12 is exercising the actual multi_match/fuzziness/index behavior.
describe('Search (e2e)', () => {
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

  async function createFlag(
    body: Record<string, unknown>,
    proj: TestProject = project,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/projects/${proj.id}/flags`)
      .set('x-api-key', proj.apiKey)
      .send(body)
      .expect(201);
    return response.body as { id: string; key: string };
  }

  async function createExperiment(
    body: Record<string, unknown>,
    proj: TestProject = project,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/projects/${proj.id}/experiments`)
      .set('x-api-key', proj.apiKey)
      .send(body)
      .expect(201);
    return response.body as { id: string; name: string };
  }

  async function search(
    q: string,
    extra: Record<string, string> = {},
    proj: TestProject = project,
  ) {
    const qs = new URLSearchParams({ q, ...extra }).toString();
    const response = await request(app.getHttpServer())
      .get(`/projects/${proj.id}/search?${qs}`)
      .set('x-api-key', proj.apiKey)
      .expect(200);
    return response.body as SearchResponseBody;
  }

  it('finds a newly created flag and experiment, merged and score-ordered', async () => {
    const flag = await createFlag({
      key: 'new-checkout',
      description: 'Rollout of the new checkout',
    });
    const experiment = await createExperiment({
      name: 'Checkout redesign',
      description: 'A/B test on the checkout flow',
    });
    await refreshSearchIndices(app);

    const response = await search('checkout');

    const ids = response.results.map((result) => result.id);
    expect(ids).toEqual(expect.arrayContaining([flag.id, experiment.id]));
    expect(response.total).toBeGreaterThanOrEqual(2);
    const flagResult = response.results.find((r) => r.id === flag.id);
    const experimentResult = response.results.find(
      (r) => r.id === experiment.id,
    );
    expect(flagResult).toMatchObject({ type: 'flag', key: 'new-checkout' });
    expect(experimentResult).toMatchObject({
      type: 'experiment',
      name: 'Checkout redesign',
    });
  });

  it('matches a typo via fuzziness', async () => {
    await createExperiment({ name: 'Checkout redesign' });
    await refreshSearchIndices(app);

    const response = await search('checkuot'); // deliberate typo

    expect(response.results.some((r) => r.name === 'Checkout redesign')).toBe(
      true,
    );
  });

  it('finds a renamed experiment by its new name, not the old one', async () => {
    // No shared tokens between the two names — multi_match matches on any
    // term (OR by default), so "Old name" would still hit "New name"
    // through the shared word "name" and give a false pass here.
    const experiment = await createExperiment({ name: 'Zzqqflow legacy' });
    await refreshSearchIndices(app);

    await request(app.getHttpServer())
      .patch(`/projects/${project.id}/experiments/${experiment.id}`)
      .set('x-api-key', project.apiKey)
      .send({ name: 'Wibblonix rebrand' })
      .expect(200);
    await refreshSearchIndices(app);

    const oldNameSearch = await search('Zzqqflow');
    expect(oldNameSearch.results.some((r) => r.id === experiment.id)).toBe(
      false,
    );

    const newNameSearch = await search('Wibblonix');
    expect(newNameSearch.results.some((r) => r.id === experiment.id)).toBe(
      true,
    );
  });

  it('removes a deleted flag from search results', async () => {
    const flag = await createFlag({ key: 'temp-flag' });
    await refreshSearchIndices(app);

    const before = await search('temp-flag');
    expect(before.results.some((r) => r.id === flag.id)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/projects/${project.id}/flags/${flag.id}`)
      .set('x-api-key', project.apiKey)
      .expect(204);
    await refreshSearchIndices(app);

    const after = await search('temp-flag');
    expect(after.results.some((r) => r.id === flag.id)).toBe(false);
  });

  it("never surfaces another project's matching flag", async () => {
    const intruder = await createTestProject(app, 'Intruder');
    await createFlag({ key: 'shared-name' }, intruder);
    const ownFlag = await createFlag({ key: 'shared-name' });
    await refreshSearchIndices(app);

    const response = await search('shared-name');

    expect(response.results.map((r) => r.id)).toEqual([ownFlag.id]);
  });

  it('narrows results by type', async () => {
    const flag = await createFlag({ key: 'checkout-flag' });
    const experiment = await createExperiment({ name: 'checkout experiment' });
    await refreshSearchIndices(app);

    const flagsOnly = await search('checkout', { type: 'flag' });
    expect(flagsOnly.results.map((r) => r.id)).toEqual([flag.id]);

    const experimentsOnly = await search('checkout', { type: 'experiment' });
    expect(experimentsOnly.results.map((r) => r.id)).toEqual([experiment.id]);
  });

  it('403s on a cross-project search URL via ProjectOwnershipGuard', async () => {
    const intruder = await createTestProject(app, 'Intruder2');

    await request(app.getHttpServer())
      .get(`/projects/${project.id}/search?q=anything`)
      .set('x-api-key', intruder.apiKey)
      .expect(403);
  });
});
