import { config } from 'dotenv';

// Must run before anything below reads process.env.RABBITMQ_URL/QUEUE — the
// values are needed as arguments to createMicroservice() itself (topology
// assertion + the transport's own options), which happens BEFORE AppModule's
// ConfigModule.forRoot() has a chance to load the .env file as a DI side
// effect. Same pre-DI-bootstrap exception src/db/migrate.ts already
// establishes in apps/api for exactly this reason — everywhere else in this
// app, config is read through ConfigService, never a bare process.env.
config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { assertTopology } from '@/messaging/assert-topology';
import { buildTopology } from '@/messaging/topology';

async function bootstrap() {
  const url = process.env.RABBITMQ_URL;
  const queue = process.env.RABBITMQ_QUEUE;
  if (!url || !queue) {
    throw new Error(
      'RABBITMQ_URL and RABBITMQ_QUEUE must be set before the worker can boot',
    );
  }

  const topology = buildTopology(queue);

  // Raw amqplib pre-step, before the microservice exists: this worker is the
  // sole owner of the topology (D5) — ServerRMQ below only ever asserts the
  // main queue it listens on, never the DLX/retry/parked queues.
  await assertTopology(url, topology);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
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
    },
  );

  await app.listen();
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
