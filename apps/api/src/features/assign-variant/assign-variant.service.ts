import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { assignVariant } from '@/entities/experiment/domain/assign-variant';
import { variants } from '@/entities/variant/infrastructure/variant.schema';
import { events } from '@/entities/event/infrastructure/event.schema';
import { ManageExperimentsService } from '@/features/manage-experiments/manage-experiments.service';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class AssignVariantService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly manageExperimentsService: ManageExperimentsService,
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

    await this.db.insert(events).values({
      experimentId,
      variantId: variant.id,
      userId,
      type: 'exposure',
    });

    return variant;
  }
}
