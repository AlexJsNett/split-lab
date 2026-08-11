import { Controller, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EVENT_PATTERN } from '@split-lab/events-contract';
import type { EventMessage } from '@split-lab/events-contract';
import type { Channel, ConsumeMessage } from 'amqplib';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { events } from '@/entities/event/infrastructure/event.schema';
import { retryCount } from '@/messaging/rmq-retry';
import { MAX_RETRIES } from '@/messaging/topology';

// Reincarnation of M9's ProcessEventsProcessor as a standalone microservice
// controller (D5, M10 plan). @EventPattern is the RabbitMQ analogue of
// @Processor('events')/WorkerHost — fire-and-forget consumption of one named
// pattern on the (single, shared) 'events' queue, not a request/response RPC.
@Controller()
export class ProcessEventsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly config: ConfigService,
  ) {}

  @EventPattern(EVENT_PATTERN.EXPOSURE)
  async handleExposure(
    @Payload() message: EventMessage,
    @Ctx() ctx: RmqContext,
  ) {
    await this.persist(message, ctx);
  }

  @EventPattern(EVENT_PATTERN.CONVERSION)
  async handleConversion(
    @Payload() message: EventMessage,
    @Ctx() ctx: RmqContext,
  ) {
    await this.persist(message, ctx);
  }

  // Every exit path here ends in exactly one ack or nack (V7) — a path that
  // does neither permanently wedges one of the consumer's `prefetchCount`
  // slots, since Nest never acks an @EventPattern handler automatically once
  // `noAck: false` is set (V6).
  private async persist(message: EventMessage, ctx: RmqContext) {
    // Nest types both getChannelRef() and getMessage() as `any`/loose
    // Record<string, any> — the same "no compile-time coupling to amqplib's
    // types" gap V1 found. Cast to the real amqplib shapes so ack/nack/
    // sendToQueue and retryCount()'s header read are actually type-checked.
    const channel = ctx.getChannelRef() as Channel;
    const raw = ctx.getMessage() as ConsumeMessage;
    const queue = this.config.getOrThrow<string>('RABBITMQ_QUEUE');

    try {
      await this.db.insert(events).values(message);
      channel.ack(raw);
    } catch {
      if (retryCount(raw, queue) >= MAX_RETRIES) {
        // Exhausted all retry cycles — hand the message to the parking lot
        // instead of nacking it again, and ack the original delivery so it
        // stops cycling through events -> events.retry -> events. It is not
        // lost: ReconcileParkedEventsService drains events.parked back onto
        // the main queue once whatever was failing (usually Postgres) recovers.
        //
        // Parks `raw.content` — the exact original envelope bytes Nest
        // deserialized `message` from (`{"pattern":...,"data":{...}}`) — not
        // a fresh JSON.stringify(message). Re-serializing just the decoded
        // payload here silently drops the `pattern` field: when the
        // reconciliation cron later republishes it, Nest has nothing to
        // route on and rejects it as an unsupported event, which cycles it
        // right back through the DLX forever without ever reaching this
        // handler again. Found live, wiring the retry -> park -> reconcile
        // path end to end (Postgres down, then back up).
        channel.sendToQueue(`${queue}.parked`, raw.content, {
          persistent: true,
        });
        channel.ack(raw);
        return;
      }

      // requeue = false -> RabbitMQ dead-letters to events.dlx -> events.retry
      // -> back onto this queue after the retry TTL (D2's Layer 1 equivalent).
      channel.nack(raw, false, false);
    }
  }
}
