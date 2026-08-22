import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { startTestWorker, TEST_RETRY_TTL_MS } from './support/test-worker';

// Proves the M13/D4 ordering for real, not just by inspection: startTestWorker
// calls the exact same createWorkerApp() production main.ts uses, which only
// resolves after startAllMicroservices() has run — so by the time this test
// even gets to make a request, the worker is genuinely consuming, and
// GET /health responding 200 is a real assertion, not a tautology.
describe('GET /health (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    // Same TTL every other e2e-spec.ts file in this suite uses — the
    // 'events_test.retry' queue is durable and shared across files, and a
    // different x-message-ttl here would 406-conflict against whichever
    // spec asserted it first (see test-worker.ts's comment on
    // TEST_RETRY_TTL_MS).
    const worker = await startTestWorker(TEST_RETRY_TTL_MS);
    app = worker.app;
    await app.listen(0); // ephemeral port — this suite only needs a real socket to hit, not a fixed one
    const httpServer = app.getHttpServer() as Server;
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with no auth header', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
