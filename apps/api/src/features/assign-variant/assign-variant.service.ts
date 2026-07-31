import { PrismaService } from '@/db/prisma.service';
import { assignVariant } from '@/entities/experiment/domain/assign-variant';
import { ManageExperimentsService } from '@/features/manage-experiments/manage-experiments.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class AssignVariantService {
  constructor(
    private readonly prisma: PrismaService,
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

    const experimentVariants = await this.prisma.variant.findMany({
      where: { experimentId },
    });

    const variant = assignVariant(experimentId, userId, experimentVariants);

    await this.prisma.event.create({
      data: {
        experimentId,
        variantId: variant.id,
        userId,
        type: 'exposure',
      },
    });

    return variant;
  }
}
