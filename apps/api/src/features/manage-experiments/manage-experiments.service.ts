import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';
import { ExperimentEntity } from '@/entities/experiment/infrastructure/experiment.entity';
import { VariantEntity } from '@/entities/variant/infrastructure/variant.entity';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateExperimentDto } from './dto/create-experiment.dto';
import { UpdateExperimentDto } from './dto/update-experiment.dto';

@Injectable()
export class ManageExperimentsService {
  constructor(
    @InjectRepository(ExperimentEntity)
    private readonly experimentRepository: Repository<ExperimentEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(VariantEntity)
    private readonly variantRepository: Repository<VariantEntity>,
  ) {}

  async create(projectId: string, dto: CreateExperimentDto) {
    await this.assertProjectExists(projectId);

    return this.experimentRepository.save(
      this.experimentRepository.create({ projectId, ...dto }),
    );
  }

  async findAll(projectId: string) {
    await this.assertProjectExists(projectId);

    return this.experimentRepository.find({ where: { projectId } });
  }

  async findOne(projectId: string, id: string) {
    const experiment = await this.experimentRepository.findOneBy({
      id,
      projectId,
    });
    if (!experiment) {
      throw new NotFoundException(
        `Experiment ${id} not found in project ${projectId}`,
      );
    }
    return experiment;
  }

  async update(projectId: string, id: string, dto: UpdateExperimentDto) {
    const experiment = await this.experimentRepository.findOneBy({
      id,
      projectId,
    });
    if (!experiment) {
      throw new NotFoundException(
        `Experiment ${id} not found in project ${projectId}`,
      );
    }
    if (dto.status === 'running') {
      const variants = await this.variantRepository.find({
        where: { experimentId: id },
      });
      const totalWeight = variants.reduce(
        (sum, variant) => sum + variant.weight,
        0,
      );
      if (totalWeight !== 100) {
        throw new BadRequestException(
          `Total weight of variants must be 100, but got ${totalWeight}`,
        );
      }
    }

    Object.assign(experiment, dto);
    return this.experimentRepository.save(experiment);
  }

  async remove(projectId: string, id: string) {
    const result = await this.experimentRepository.delete({ id, projectId });
    if (result.affected === 0) {
      throw new NotFoundException(`Experiment ${id} not found`);
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
