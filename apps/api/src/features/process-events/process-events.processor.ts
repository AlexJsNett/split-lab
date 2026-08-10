import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { events } from '@/entities/event/infrastructure/event.schema';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface EventJobData {
  experimentId: string;
  variantId: string;
  userId: string;
  type: 'exposure' | 'conversion';
}

// The actual durable write that assign-variant/log-conversion used to do
// synchronously in the request handler. Running here, off the request path,
// means a slow/degraded Postgres no longer adds latency to assign()'s hot path —
// this worker absorbs that cost instead, on its own schedule.
@Processor('events')
export class ProcessEventsProcessor extends WorkerHost {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super();
  }

  async process(job: Job<EventJobData>) {
    const { experimentId, variantId, userId, type } = job.data;
    await this.db.insert(events).values({
      experimentId,
      variantId,
      userId,
      type,
    });
  }
}
