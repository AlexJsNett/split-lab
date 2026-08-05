import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { events } from '@/entities/event/infrastructure/event.schema';
import { ManageExperimentsService } from '@/features/manage-experiments/manage-experiments.service';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class LogConversionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly manageExperimentsService: ManageExperimentsService,
  ) {}

  async logConversion(projectId: string, experimentId: string, userId: string) {
    // experiment must exist in this project — findOne throws NotFoundException itself
    await this.manageExperimentsService.findOne(projectId, experimentId);

    // a conversion without a prior exposure is meaningless — we need to know which
    // variant to attribute it to. Deliberately NOT checking status === 'running' here
    // (unlike assign) — a user could get exposed while the experiment was still running
    // and convert after it stopped; that's a normal, expected case.
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

    if (!exposure) {
      throw new BadRequestException(
        `No exposure recorded for user ${userId} in experiment ${experimentId} — cannot log a conversion without it`,
      );
    }

    const [conversion] = await this.db
      .insert(events)
      .values({
        experimentId,
        variantId: exposure.variantId,
        userId,
        type: 'conversion',
      })
      .returning();

    return conversion;
  }
}
