import { EventJobData } from '@/features/process-events/process-events.processor';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';

// Layer 3 of the M9 reliability follow-up: attempts + backoff (Layer 1) give a
// job 3 tries against a transient Postgres blip, but BullMQ doesn't discard a
// job that exhausts all attempts — it sits in Redis's failed set (we don't set
// removeOnFail). This job periodically gives those permanently-failed jobs
// another shot, so a Postgres outage longer than the ~7s Layer 1 window
// doesn't mean permanent data loss once Postgres recovers.
//
// Every 5 minutes, not every 1 — a Postgres outage doesn't resolve in
// seconds, so checking every minute just re-fails the same jobs against a
// still-down database. This queue reuses the same Redis connection every
// producer already holds open for .add(), so the marginal cost of the
// check itself (one getFailed() call, no-op when empty) doesn't change
// with the interval — 5 minutes only exists to give Postgres real recovery
// time before retrying, not to save resources.
@Injectable()
export class ReconcileFailedEventsService {
  constructor(
    @InjectQueue('events') private readonly eventsQueue: Queue<EventJobData>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileFailedEvents() {
    const failedJobs = await this.eventsQueue.getFailed();

    for (const job of failedJobs) {
      // Re-enters the normal ProcessEventsProcessor.process() path — one code
      // path for "how an event gets written," not a second manual insert here.
      await job.retry();
    }
  }
}
