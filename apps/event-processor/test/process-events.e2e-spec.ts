import { randomUUID } from 'node:crypto';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { Pool } from 'pg';
import { EVENT_PATTERN } from '@split-lab/events-contract';
import {
  cleanDatabase,
  connectRawChannel,
  createTestClient,
  createTestPool,
  seedExperimentAndVariant,
  startTestWorker,
  TEST_RETRY_TTL_MS,
  TestWorker,
  waitFor,
} from './support/test-worker';

// Real RabbitMQ + real splitlab_test Postgres, real worker microservice
// (D8, M10 plan). Retry TTL overridden (TEST_RETRY_TTL_MS) so the
// forced-failure test below isn't gated on real 5-second sleeps.
describe('Event processing worker (e2e)', () => {
  let worker: TestWorker;
  let client: ClientProxy;
  let pool: Pool;

  beforeAll(async () => {
    worker = await startTestWorker(TEST_RETRY_TTL_MS);
    client = createTestClient();
    pool = createTestPool();
  });

  afterAll(async () => {
    await client.close();
    await worker.close();
    await pool.end();
  });

  beforeEach(async () => {
    await cleanDatabase(pool);
    const { channel, connection } = await connectRawChannel();
    await channel.purgeQueue(worker.topology.queue);
    await channel.purgeQueue(worker.topology.retryQueue);
    await channel.purgeQueue(worker.topology.parkedQueue);
    await channel.close();
    await connection.close();
  });

  it('persists a published exposure event and acks it (happy path)', async () => {
    const { experimentId, variantId } = await seedExperimentAndVariant(pool);
    const userId = `happy-path-${randomUUID()}`;

    await firstValueFrom(
      client.emit(EVENT_PATTERN.EXPOSURE, {
        experimentId,
        variantId,
        userId,
        type: 'exposure',
      }),
    );

    await waitFor(async () => {
      const result = await pool.query(
        'SELECT * FROM events WHERE "userId" = $1',
        [userId],
      );
      return result.rowCount === 1;
    });

    const result = await pool.query(
      'SELECT "experimentId", "variantId", "userId", type FROM events WHERE "userId" = $1',
      [userId],
    );
    expect(result.rows[0]).toEqual({
      experimentId,
      variantId,
      userId,
      type: 'exposure',
    });
  });

  it('persists a published conversion event and acks it', async () => {
    const { experimentId, variantId } = await seedExperimentAndVariant(pool);
    const userId = `conversion-${randomUUID()}`;

    await firstValueFrom(
      client.emit(EVENT_PATTERN.CONVERSION, {
        experimentId,
        variantId,
        userId,
        type: 'conversion',
      }),
    );

    await waitFor(async () => {
      const result = await pool.query(
        'SELECT * FROM events WHERE "userId" = $1',
        [userId],
      );
      return result.rowCount === 1;
    });
  });

  it(
    'a message that can never persist (FK violation) cycles through retry ' +
      'and lands in the parking lot, never in the events table',
    async () => {
      // experimentId/variantId are well-formed UUIDs but reference no real
      // row — the insert fails every single time, the same shape of failure
      // Postgres itself would raise the whole time it's down. Deliberately
      // not stopping the real Postgres container for this (slow, flaky,
      // and shared with the api e2e suite) — a permanent FK violation
      // exercises the exact same retry/park code path deterministically.
      const experimentId = randomUUID();
      const variantId = randomUUID();
      const userId = `forced-failure-${randomUUID()}`;

      await firstValueFrom(
        client.emit(EVENT_PATTERN.EXPOSURE, {
          experimentId,
          variantId,
          userId,
          type: 'exposure',
        }),
      );

      // 3 retry cycles at RETRY_TTL_MS each, plus processing slack.
      const { channel, connection } = await connectRawChannel();
      try {
        await waitFor(async () => {
          const parked = await channel.checkQueue(worker.topology.parkedQueue);
          return parked.messageCount === 1;
        }, 5000);

        const main = await channel.checkQueue(worker.topology.queue);
        const retry = await channel.checkQueue(worker.topology.retryQueue);
        expect(main.messageCount).toBe(0);
        expect(retry.messageCount).toBe(0);
      } finally {
        await channel.close();
        await connection.close();
      }

      const result = await pool.query(
        'SELECT * FROM events WHERE "userId" = $1',
        [userId],
      );
      expect(result.rowCount).toBe(0);
    },
    10000,
  );
});
