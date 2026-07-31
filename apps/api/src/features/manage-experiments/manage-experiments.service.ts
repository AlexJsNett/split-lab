import { PrismaService } from '@/db/prisma.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateExperimentDto } from './dto/create-experiment.dto';
import { UpdateExperimentDto } from './dto/update-experiment.dto';

@Injectable()
export class ManageExperimentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateExperimentDto) {
    await this.assertProjectExists(projectId);

    return this.prisma.experiment.create({
      data: { projectId, ...dto },
    });
  }

  async findAll(projectId: string) {
    await this.assertProjectExists(projectId);
    return this.prisma.experiment.findMany({ where: { projectId } });
  }

  async findOne(projectId: string, id: string) {
    const experiment = await this.prisma.experiment.findFirst({
      where: { id, projectId },
    });
    if (!experiment) {
      throw new NotFoundException(
        `Experiment ${id} not found in project ${projectId}`,
      );
    }
    return experiment;
  }

  async update(projectId: string, id: string, dto: UpdateExperimentDto) {
    const experiment = await this.prisma.experiment.findFirst({
      where: { id, projectId },
    });
    if (!experiment) {
      throw new NotFoundException(
        `Experiment ${id} not found in project ${projectId}`,
      );
    }

    if (dto.status === 'running') {
      const experimentVariants = await this.prisma.variant.findMany({
        where: { experimentId: id },
      });
      const totalWeight = experimentVariants.reduce(
        (sum, variant) => sum + variant.weight,
        0,
      );
      if (totalWeight !== 100) {
        throw new BadRequestException(
          `Total weight of variants must be 100, but got ${totalWeight}`,
        );
      }
    }

    const [updated] = await this.prisma.experiment.updateManyAndReturn({
      where: { id },
      data: dto,
    });
    return updated;
  }

  async remove(projectId: string, id: string) {
    const { count } = await this.prisma.experiment.deleteMany({
      where: { id, projectId },
    });
    if (count === 0) {
      throw new NotFoundException(`Experiment ${id} not found`);
    }
  }

  private async assertProjectExists(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
  }
}
