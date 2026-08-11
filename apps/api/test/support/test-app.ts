import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as amqp from 'amqplib';
import request from 'supertest';
import { App } from 'supertest/types';
import type { EventMessage, EventType } from '@split-lab/events-contract';
import { AppModule } from '../../src/app/app.module';
import { DRIZZLE } from '../../src/db/drizzle.module';
import { events } from '../../src/entities/event/infrastructure/event.schema';
import * as schema from '../../src/db/schema';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  // matches main.ts — DTO validation only kicks in with this pipe registered,
  // and main.ts's bootstrap never runs in an e2e test (createNestApplication
  // builds the app in-memory, no listen()), so it has to be set up here too.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();

  // apps/event-processor is the sole owner of the RabbitMQ topology (D5, M10
  // plan) and normally asserts it at its own boot — but this suite never
  // boots that worker (D8: "the API's job is to publish a correct message,"
  // tested independently of the worker). Without SOMETHING declaring the
  // 'events_test' queue first, a producer's publish has nowhere to route to
  // and is silently dropped. Assert with the exact same durable +
  // x-dead-letter-exchange arguments the worker itself would use, so this
  // can never 406-conflict with it (V9) whether or not the worker has ever
  // run against this same queue.
  await assertEventsQueueExists(app);

  return app;
}

async function assertEventsQueueExists(app: INestApplication<App>) {
  const config = app.get(ConfigService);
  const url = config.getOrThrow<string>('RABBITMQ_URL');
  const queue = config.getOrThrow<string>('RABBITMQ_QUEUE');

  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await channel.assertQueue(queue, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': `${queue}.dlx` },
  });
  await channel.close();
  await connection.close();
}

// One TRUNCATE across every table in the same statement handles the FK chain
// (events -> variants/experiments, experiments -> projects/feature_flags,
// feature_flags -> projects) without needing CASCADE or a truncation order.
// Also purges the events_test queue — Postgres rows reset between tests via
// TRUNCATE, but a message a previous test published and never drained would
// otherwise still be sitting in the queue for the next test's
// readPublishedEvents() to read.
export async function cleanDatabase(app: INestApplication<App>) {
  const db = app.get<NodePgDatabase<typeof schema>>(DRIZZLE);
  await db.execute(
    sql`TRUNCATE TABLE events, variants, experiments, feature_flags, projects RESTART IDENTITY CASCADE`,
  );
  await purgeEventsQueue(app);
}

async function purgeEventsQueue(app: INestApplication<App>) {
  const config = app.get(ConfigService);
  const url = config.getOrThrow<string>('RABBITMQ_URL');
  const queue = config.getOrThrow<string>('RABBITMQ_QUEUE');

  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await channel.purgeQueue(queue);
  await channel.close();
  await connection.close();
}

// Drains up to `count` messages published to the events_test queue and
// returns their decoded EventMessage payloads — lets assign/conversions
// specs assert "the right message was published" instead of "a row
// eventually appeared" (D8). Reads the `data` field out of Nest's own
// {"pattern":...,"data":{...}} envelope (the same shape ClientProxy.emit()
// produces), not a bare EventMessage.
export async function readPublishedEvents(
  app: INestApplication<App>,
  count: number,
  timeoutMs = 5000,
): Promise<EventMessage[]> {
  const config = app.get(ConfigService);
  const url = config.getOrThrow<string>('RABBITMQ_URL');
  const queue = config.getOrThrow<string>('RABBITMQ_QUEUE');

  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  const messages: EventMessage[] = [];
  const start = Date.now();

  try {
    while (messages.length < count) {
      const raw = await channel.get(queue, { noAck: true });
      if (raw) {
        const envelope = JSON.parse(raw.content.toString()) as {
          data: EventMessage;
        };
        messages.push(envelope.data);
        continue;
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `expected ${count} published event(s) on '${queue}', got ${messages.length} within ${timeoutMs}ms`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally {
    await channel.close();
    await connection.close();
  }

  return messages;
}

export interface SeedEventInput {
  experimentId: string;
  variantId: string;
  userId: string;
  type: EventType;
}

// Inserts event rows straight through the DRIZZLE client — used where a spec
// needs a row already durably in Postgres without depending on a worker
// process this suite never boots (D8): the prior exposure `POST /conversions`
// looks up via `findExposureWithRetry`, and the rows `GET /results`
// aggregates. `/results` is a pure read endpoint, so seeding is a faithful
// test of it.
export async function seedEvents(
  app: INestApplication<App>,
  rows: SeedEventInput[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const db = app.get<NodePgDatabase<typeof schema>>(DRIZZLE);
  await db.insert(events).values(rows);
}

export interface TestProject {
  id: string;
  name: string;
  apiKey: string;
}

// Every e2e test needs at least one authenticated project to attach the
// `x-api-key` header — this is the real POST /projects endpoint (a
// @Public() route), not a DB shortcut, so it exercises the same creation
// path a real client would use.
export async function createTestProject(
  app: INestApplication<App>,
  name = 'Test Project',
): Promise<TestProject> {
  const response = await request(app.getHttpServer())
    .post('/projects')
    .send({ name })
    .expect(201);
  return response.body as TestProject;
}
