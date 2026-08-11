import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ReconcileParkedEventsService } from '@/features/process-events/reconcile-parked-events.service';
import {
  cleanDatabase,
  connectRawChannel,
  createTestPool,
  seedExperimentAndVariant,
  startTestWorker,
  TEST_RETRY_TTL_MS,
  TestWorker,
  waitFor,
} from './support/test-worker';

// Real RabbitMQ + real splitlab_test Postgres, real worker microservice
// (D8, M10 plan). Calls ReconcileParkedEventsService.reconcileParkedEvents()
// directly rather than waiting for its real @Cron(EVERY_5_MINUTES) schedule
// to fire — this tests the method's own logic against real infra, not the
// cron timing (which was already verified live against the M10 plan's
// acceptance criteria for step 3).
describe('ReconcileParkedEventsService (e2e)', () => {
  let worker: TestWorker;
  let pool: Pool;
  let reconcileService: ReconcileParkedEventsService;

  beforeAll(async () => {
    worker = await startTestWorker(TEST_RETRY_TTL_MS);
    pool = createTestPool();
    reconcileService = worker.app.get(ReconcileParkedEventsService);
  });

  afterAll(async () => {
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

  it('is a no-op when the parking lot is empty', async () => {
    await expect(
      reconcileService.reconcileParkedEvents(),
    ).resolves.toBeUndefined();

    const { channel, connection } = await connectRawChannel();
    const parked = await channel.checkQueue(worker.topology.parkedQueue);
    await channel.close();
    await connection.close();
    expect(parked.messageCount).toBe(0);
  });

  it('drains every parked message back onto the main queue, and the worker persists it', async () => {
    const { experimentId, variantId } = await seedExperimentAndVariant(pool);
    const userIds = [
      `reconcile-1-${randomUUID()}`,
      `reconcile-2-${randomUUID()}`,
      `reconcile-3-${randomUUID()}`,
    ];

    const { channel, connection } = await connectRawChannel();
    for (const userId of userIds) {
      // A message parked earlier (persist()'s own parking handoff preserves
      // this exact envelope shape — see process-events.controller.ts) —
      // seeded directly here so this test doesn't depend on first driving a
      // real message through 3 retry cycles just to get one into the
      // parking lot.
      channel.sendToQueue(
        worker.topology.parkedQueue,
        Buffer.from(
          JSON.stringify({
            pattern: 'exposure',
            data: { experimentId, variantId, userId, type: 'exposure' },
          }),
        ),
        { persistent: true },
      );
    }
    await channel.close();
    await connection.close();

    await waitFor(async () => {
      const { channel: checkChannel, connection: checkConnection } =
        await connectRawChannel();
      const parked = await checkChannel.checkQueue(worker.topology.parkedQueue);
      await checkChannel.close();
      await checkConnection.close();
      return parked.messageCount === userIds.length;
    });

    await reconcileService.reconcileParkedEvents();

    await waitFor(async () => {
      const result = await pool.query<{ count: string }>(
        'SELECT count(*) FROM events WHERE "userId" = ANY($1)',
        [userIds],
      );
      return Number(result.rows[0].count) === userIds.length;
    });

    const { channel: afterChannel, connection: afterConnection } =
      await connectRawChannel();
    const parkedAfter = await afterChannel.checkQueue(
      worker.topology.parkedQueue,
    );
    await afterChannel.close();
    await afterConnection.close();
    expect(parkedAfter.messageCount).toBe(0);
  });
});
