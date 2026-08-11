import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as amqp from 'amqplib';

// Layer 3 of the M9 reliability mapping, rebuilt on RabbitMQ's own parking-lot
// mechanism (D2 in the M10 plan). A message that exhausts all
// events -> events.retry -> events cycles lands in events.parked instead of
// being lost — this cron periodically drains that parking lot back onto the
// main queue, giving it a fresh set of retry cycles against whatever was
// failing (usually Postgres) once that recovers. Same 5-minute interval and
// reasoning as M9's ReconcileFailedEventsService: the check is essentially
// free when the parking lot is empty, 5 minutes exists purely to give
// Postgres real recovery time before retrying, not to save resources.
@Injectable()
export class ReconcileParkedEventsService {
  constructor(private readonly config: ConfigService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileParkedEvents() {
    const url = this.config.getOrThrow<string>('RABBITMQ_URL');
    const queue = this.config.getOrThrow<string>('RABBITMQ_QUEUE');
    const parkedQueue = `${queue}.parked`;

    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();

    try {
      // channel.get() is a one-shot pull (no consumer subscription needed for
      // a job that only runs every 5 minutes); it resolves to `false` once
      // the queue is empty, which is also the no-op case.
      for (;;) {
        const message = await channel.get(parkedQueue, { noAck: false });
        if (!message) {
          break;
        }

        channel.sendToQueue(queue, message.content, { persistent: true });
        channel.ack(message);
      }
    } finally {
      await channel.close();
      await connection.close();
    }
  }
}
