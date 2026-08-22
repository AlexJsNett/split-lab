import { config } from 'dotenv';

// Must run before anything below reads process.env.RABBITMQ_URL/QUEUE — the
// values are needed as arguments to createMicroservice() itself (topology
// assertion + the transport's own options), which happens BEFORE AppModule's
// ConfigModule.forRoot() has a chance to load the .env file as a DI side
// effect. Same pre-DI-bootstrap exception src/db/migrate.ts already
// establishes in apps/api for exactly this reason — everywhere else in this
// app, config is read through ConfigService, never a bare process.env.
config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { assertTopology } from '@/messaging/assert-topology';
import { buildTopology, EventsTopology } from '@/messaging/topology';

export interface WorkerApp {
  app: INestApplication;
  topology: EventsTopology;
}

// Shared by this file's own bootstrap() AND test/support/test-worker.ts
// (which used to duplicate this whole sequence with a plain
// createMicroservice() call, pre-dating the hybrid-app change below) — one
// implementation means the ordering that actually matters is exercised by
// every e2e test that boots a worker, not just production.
export async function createWorkerApp(retryTtlMs?: number): Promise<WorkerApp> {
  const url = process.env.RABBITMQ_URL;
  const queue = process.env.RABBITMQ_QUEUE;
  if (!url || !queue) {
    throw new Error(
      'RABBITMQ_URL and RABBITMQ_QUEUE must be set before the worker can boot',
    );
  }

  const topology = buildTopology(queue, retryTtlMs);

  // Raw amqplib pre-step, before the microservice exists: this worker is the
  // sole owner of the topology (D5) — ServerRMQ below only ever asserts the
  // main queue it listens on, never the DLX/retry/parked queues.
  await assertTopology(url, topology);

  // Hybrid app (M13, D4) — this process now has an HTTP server too, purely
  // so `GET /health` exists. The ordering below is the entire point: connect
  // the RMQ microservice and await startAllMicroservices() BEFORE app.listen()
  // opens the HTTP port. That makes "the health endpoint responds 200" a true
  // proxy for "this worker is actually consuming," not just "the process
  // didn't crash" — Docker's healthcheck (and docker-compose's `--wait`) can
  // then gate on it instead of api/the D8 stack e2e having to poll RabbitMQ's
  // management API themselves. See docker.md.
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [url],
      queue: topology.queue,
      queueOptions: {
        durable: true,
        arguments: topology.queueArguments,
      },
      noAck: false, // V4 — Nest's default is auto-ack, which would drop a
      // message the instant it's written to the socket, before this
      // worker's own insert even runs.
      prefetchCount: 10,
      // No `persistent` here — that flag only affects messages THIS side
      // publishes. The consumer's own publishes (the parked-queue handoff
      // in process-events.controller.ts, the republish in
      // reconcile-parked-events.service.ts) each set persistent: true
      // per-call instead (V5). The queue's own durability comes from
      // `durable: true` above and the topology assertion, not this option.
    },
  });

  await app.startAllMicroservices();
  return { app, topology };
}

async function bootstrap() {
  const { app } = await createWorkerApp();
  // Lets Nest catch SIGTERM/SIGINT (docker compose down sends SIGTERM) and
  // run onModuleDestroy/close hooks — without this, in-flight RMQ deliveries
  // and open HTTP connections get SIGKILLed after the grace period instead
  // of draining.
  app.enableShutdownHooks();
  // PORT, not a bare 3000: apps/api's own dev script already owns host port
  // 3000 for `pnpm dev:api`, and this app had no HTTP port at all before
  // M13's hybrid-app change — hardcoding 3000 here would make `pnpm
  // dev:events` unusable alongside it. Docker Compose sets nothing, so the
  // containers still default to 3000 internally.
  await app.listen(process.env.PORT ?? 3000);
}

// Only actually boot when this file is the process entry point (`node
// dist/app/main` / `nest start`) — not when test-worker.ts imports
// createWorkerApp from it. Same guard apps/api/src/search/reindex.ts uses
// for the same reason.
if (require.main === module) {
  bootstrap().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
