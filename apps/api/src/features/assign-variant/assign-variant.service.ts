import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { assignVariant } from '@/entities/experiment/domain/assign-variant';
import { variants } from '@/entities/variant/infrastructure/variant.schema';
import { ManageExperimentsService } from '@/features/manage-experiments/manage-experiments.service';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { EVENT_PATTERN } from '@split-lab/events-contract';
import type { EventMessage } from '@split-lab/events-contract';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AssignVariantService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly manageExperimentsService: ManageExperimentsService,
    @Inject('EVENTS_CLIENT') private readonly client: ClientProxy,
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
    // apps/event-processor (a separate NestJS microservice, M10) consumes
    // this over RabbitMQ and does the actual insert. firstValueFrom resolves
    // once the broker confirms the publish (V10) — a real durability
    // guarantee the prior queue library's .add() never gave us.
    const message: EventMessage = {
      experimentId,
      variantId: variant.id,
      userId,
      type: 'exposure',
    };
    await firstValueFrom(this.client.emit(EVENT_PATTERN.EXPOSURE, message));

    return variant;
  }
}
