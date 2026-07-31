import { PrismaService } from '@/db/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Injectable()
export class ManageVariantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(experimentId: string, dto: CreateVariantDto) {
    await this.assertExperimentExists(experimentId);

    return this.prisma.variant.create({
      data: { experimentId, ...dto },
    });
  }

  async findAll(experimentId: string) {
    await this.assertExperimentExists(experimentId);
    return this.prisma.variant.findMany({ where: { experimentId } });
  }

  async findOne(experimentId: string, id: string) {
    const variant = await this.prisma.variant.findFirst({
      where: { id, experimentId },
    });
    if (!variant) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
    return variant;
  }

  async update(experimentId: string, id: string, dto: UpdateVariantDto) {
    const [variant] = await this.prisma.variant.updateManyAndReturn({
      where: { id, experimentId },
      data: dto,
    });
    if (!variant) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
    return variant;
  }

  async remove(experimentId: string, id: string) {
    const { count } = await this.prisma.variant.deleteMany({
      where: { id, experimentId },
    });
    if (count === 0) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
  }

  private async assertExperimentExists(experimentId: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
    });
    if (!experiment) {
      throw new NotFoundException(`Experiment ${experimentId} not found`);
    }
  }
}
