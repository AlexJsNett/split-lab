import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';
import { FeatureFlagEntity } from '@/entities/feature-flag/infrastructure/feature-flag.entity';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';

@Injectable()
export class ManageFlagsService {
  constructor(
    @InjectRepository(FeatureFlagEntity)
    private readonly featureFlagRepository: Repository<FeatureFlagEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
  ) {}

  async create(projectId: string, dto: CreateFeatureFlagDto) {
    await this.assertProjectExists(projectId);

    return this.featureFlagRepository.save(
      this.featureFlagRepository.create({ projectId, ...dto }),
    );
  }

  async findAll(projectId: string) {
    await this.assertProjectExists(projectId);
    return this.featureFlagRepository.find({ where: { projectId } });
  }

  async findOne(projectId: string, id: string) {
    const flag = await this.featureFlagRepository.findOneBy({
      id,
      projectId,
    });
    if (!flag) {
      throw new NotFoundException(`Flag ${id} not found`);
    }
    return flag;
  }

  async update(projectId: string, id: string, dto: UpdateFeatureFlagDto) {
    const flag = await this.featureFlagRepository.findOneBy({
      id,
      projectId,
    });
    if (!flag) {
      throw new NotFoundException(`Flag ${id} not found`);
    }
    Object.assign(flag, dto);
    return this.featureFlagRepository.save(flag);
  }

  async remove(projectId: string, id: string) {
    const result = await this.featureFlagRepository.delete({
      id,
      projectId,
    });
    if (result.affected === 0) {
      throw new NotFoundException(`Flag ${id} not found`);
    }
  }

  private async assertProjectExists(projectId: string) {
    const project = await this.projectRepository.findOneBy({
      id: projectId,
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
  }
}
