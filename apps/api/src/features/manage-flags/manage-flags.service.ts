import { PrismaService } from '@/db/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';

@Injectable()
export class ManageFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateFeatureFlagDto) {
    await this.assertProjectExists(projectId);

    return this.prisma.featureFlag.create({
      data: { projectId, ...dto },
    });
  }

  async findAll(projectId: string) {
    await this.assertProjectExists(projectId);
    return this.prisma.featureFlag.findMany({ where: { projectId } });
  }

  async findOne(projectId: string, id: string) {
    const flag = await this.prisma.featureFlag.findFirst({
      where: { id, projectId },
    });
    if (!flag) {
      throw new NotFoundException(`Flag ${id} not found`);
    }
    return flag;
  }

  async update(projectId: string, id: string, dto: UpdateFeatureFlagDto) {
    const [flag] = await this.prisma.featureFlag.updateManyAndReturn({
      where: { id, projectId },
      data: dto,
    });
    if (!flag) {
      throw new NotFoundException(`Flag ${id} not found`);
    }
    return flag;
  }

  async remove(projectId: string, id: string) {
    const { count } = await this.prisma.featureFlag.deleteMany({
      where: { id, projectId },
    });
    if (count === 0) {
      throw new NotFoundException(`Flag ${id} not found`);
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
