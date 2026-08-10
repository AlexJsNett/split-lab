import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { events } from '@/entities/event/infrastructure/event.schema';
import { ManageExperimentsService } from '@/features/manage-experiments/manage-experiments.service';
import { EventJobData } from '@/features/process-events/process-events.processor';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Exposure writes moved off the request path (M9) — the exposure a conversion
// needs to attribute to may still be sitting in the queue, not yet in Postgres,
// when the conversion request arrives right behind it. Same eventual-consistency
// gap real event pipelines (Amplitude/Segment/PostHog) accept; solved with a
// short bounded retry here rather than making exposure synchronous again.
const EXPOSURE_RETRY_DELAYS_MS = [25, 50, 100];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class LogConversionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly manageExperimentsService: ManageExperimentsService,
    @InjectQueue('events') private readonly eventsQueue: Queue<EventJobData>,
  ) {}

  async logConversion(projectId: string, experimentId: string, userId: string) {
    // experiment must exist in this project — findOne throws NotFoundException itself
    await this.manageExperimentsService.findOne(projectId, experimentId);

    // a conversion without a prior exposure is meaningless — we need to know which
    // variant to attribute it to. Deliberately NOT checking status === 'running' here
    // (unlike assign) — a user could get exposed while the experiment was still running
    // and convert after it stopped; that's a normal, expected case.
    const exposure = await this.findExposureWithRetry(experimentId, userId);

    if (!exposure) {
      throw new BadRequestException(
        `No exposure recorded for user ${userId} in experiment ${experimentId} — cannot log a conversion without it`,
      );
    }

    await this.eventsQueue.add('conversion', {
      experimentId,
      variantId: exposure.variantId,
      userId,
      type: 'conversion',
    });

    return {
      experimentId,
      variantId: exposure.variantId,
      userId,
      type: 'conversion',
    };
  }

  // Attempts an immediate read, then retries after 25ms/50ms/100ms (4 total
  // attempts, ~175ms worst case) before giving up — bridges the gap between
  // assign() enqueuing the exposure and the worker actually persisting it.
  private async findExposureWithRetry(experimentId: string, userId: string) {
    for (let attempt = 0; ; attempt++) {
      const [exposure] = await this.db
        .select()
        .from(events)
        .where(
          and(
            eq(events.experimentId, experimentId),
            eq(events.userId, userId),
            eq(events.type, 'exposure'),
          ),
        );

      if (exposure) {
        return exposure;
      }

      if (attempt >= EXPOSURE_RETRY_DELAYS_MS.length) {
        return undefined;
      }

      await sleep(EXPOSURE_RETRY_DELAYS_MS[attempt]);
    }
  }
}
