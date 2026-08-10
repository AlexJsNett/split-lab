import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { assignVariant } from '@/entities/experiment/domain/assign-variant';
import { variants } from '@/entities/variant/infrastructure/variant.schema';
import { ManageExperimentsService } from '@/features/manage-experiments/manage-experiments.service';
import { EventJobData } from '@/features/process-events/process-events.processor';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class AssignVariantService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly manageExperimentsService: ManageExperimentsService,
    @InjectQueue('events') private readonly eventsQueue: Queue<EventJobData>,
  ) {}

  async assign(projectId: string, experimentId: string, userId: string) {
    const experiment = await this.manageExperimentsService.findOne(
      projectId,
      experimentId,
    );
    if (experiment.status !== 'running') {
      throw new BadRequestException(
        `Experiment ${experimentId} is not running`,
      );
    }

    const experimentVariants = await this.db
      .select()
      .from(variants)
      .where(eq(variants.experimentId, experimentId));

    const variant = assignVariant(experimentId, userId, experimentVariants);

    // Durable write moves off the request path — assign() is the hot path,
    // called on every flag/experiment check, so it can't wait on Postgres.
    // A worker (ProcessEventsProcessor) drains this queue and does the actual insert.
    await this.eventsQueue.add('exposure', {
      experimentId,
      variantId: variant.id,
      userId,
      type: 'exposure',
    });

    return variant;
  }
}
