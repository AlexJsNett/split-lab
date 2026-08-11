import { config as loadEnv } from 'dotenv';

// Same reasoning as src/app/main.ts — RABBITMQ_URL/QUEUE are needed before
// AppModule's own ConfigModule.forRoot() has run, so this suite's dotenv load
// happens explicitly here rather than relying on it. Unconditional: this file
// is only ever imported by *.e2e-spec.ts, which always runs against .env.test.
loadEnv({ path: '.env.test' });

import { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ClientProxy,
  ClientProxyFactory,
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import * as amqp from 'amqplib';
import { Pool } from 'pg';
import { AppModule } from '@/app/app.module';
import { assertTopology } from '@/messaging/assert-topology';
import { buildTopology, EventsTopology } from '@/messaging/topology';

// Every *.e2e-spec.ts file in this suite must assert 'events_test.retry'
// with the SAME x-message-ttl — the queue is durable and outlives any one
// file's worker connection, so two files picking different ttl overrides
// would 406-conflict against each other the moment the second file's
// beforeAll runs (the exact V9 failure mode, but between this suite's own
// files rather than between the API and the worker). One shared constant,
// not a per-file choice.
export const TEST_RETRY_TTL_MS = 200;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set (.env.test) to run this suite`);
  }
  return value;
}

export interface TestWorker {
  app: INestMicroservice;
  topology: EventsTopology;
  close: () => Promise<void>;
}

// Test-only equivalent of src/app/main.ts's bootstrap — the same
// assertTopology-then-createMicroservice sequence, parameterized so
// retry-timing tests can pass a small retryTtlMs instead of being gated on
// real 5-second sleeps (test plan, M10).
export async function startTestWorker(
  retryTtlMs?: number,
): Promise<TestWorker> {
  const url = requiredEnv('RABBITMQ_URL');
  const queue = requiredEnv('RABBITMQ_QUEUE');
  const topology = buildTopology(queue, retryTtlMs);

  await assertTopology(url, topology);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [url],
        queue: topology.queue,
        queueOptions: { durable: true, arguments: topology.queueArguments },
        noAck: false,
        prefetchCount: 10,
      },
    },
  );
  await app.listen();

  return { app, topology, close: () => app.close() };
}

// Real ClientProxy, real wire format — publishing this way (rather than a
// hand-built envelope) exercises the actual Nest {"pattern",...,"data":...}
// round trip the worker's @EventPattern handlers depend on. noAssert: true
// matches apps/api's own producers (D4) — this suite's worker is the
// topology owner, same as in production.
export function createTestClient(): ClientProxy {
  return ClientProxyFactory.create({
    transport: Transport.RMQ,
    options: {
      urls: [requiredEnv('RABBITMQ_URL')],
      queue: requiredEnv('RABBITMQ_QUEUE'),
      persistent: true,
      noAssert: true,
    },
  });
}

export function createTestPool(): Pool {
  return new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

export async function cleanDatabase(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE TABLE events, variants, experiments, feature_flags, projects RESTART IDENTITY CASCADE',
  );
}

export interface SeededExperiment {
  experimentId: string;
  variantId: string;
}

// Raw SQL, not Drizzle — this package deliberately doesn't own the
// projects/experiments/variants schema (D3, M10 plan), only `events`. The
// physical tables already exist in splitlab_test via apps/api's own
// migrations; this only exists to satisfy the FK constraints a real insert
// needs, the same constraints the M10 plan leaves enforced in the database
// rather than redeclared here.
export async function seedExperimentAndVariant(
  pool: Pool,
): Promise<SeededExperiment> {
  const projectResult = await pool.query<{ id: string }>(
    'INSERT INTO projects (name, "apiKeyHash") VALUES ($1, $2) RETURNING id',
    ['event-processor e2e project', `test-hash-${Date.now()}-${Math.random()}`],
  );
  const projectId = projectResult.rows[0].id;

  const experimentResult = await pool.query<{ id: string }>(
    'INSERT INTO experiments ("projectId", name, status) VALUES ($1, $2, $3) RETURNING id',
    [projectId, 'event-processor e2e experiment', 'running'],
  );
  const experimentId = experimentResult.rows[0].id;

  const variantResult = await pool.query<{ id: string }>(
    'INSERT INTO variants ("experimentId", key, weight) VALUES ($1, $2, $3) RETURNING id',
    [experimentId, 'control', 100],
  );
  const variantId = variantResult.rows[0].id;

  return { experimentId, variantId };
}

export async function connectRawChannel(): Promise<{
  connection: amqp.ChannelModel;
  channel: amqp.Channel;
}> {
  const connection = await amqp.connect(requiredEnv('RABBITMQ_URL'));
  const channel = await connection.createChannel();
  return { connection, channel };
}

// Polls a condition instead of a fixed sleep — fast in the common case, with
// a ceiling if something's actually stuck. Same shape as apps/api's own
// waitForQueueDrain (M9) used before it was replaced under D8.
export async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 25,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`condition not met within ${timeoutMs}ms`);
}
