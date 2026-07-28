import { ExperimentEntity } from '@/entities/experiment/infrastructure/experiment.entity';
import { VariantEntity } from '@/entities/variant/infrastructure/variant.entity';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Injectable()
export class ManageVariantsService {
  constructor(
    @InjectRepository(VariantEntity)
    private readonly variantRepository: Repository<VariantEntity>,
    @InjectRepository(ExperimentEntity)
    private readonly experimentRepository: Repository<ExperimentEntity>,
  ) {}

  async create(experimentId: string, dto: CreateVariantDto) {
    await this.assertExperimentExists(experimentId);

    return this.variantRepository.save(
      this.variantRepository.create({ experimentId, ...dto }),
    );
  }

  async findAll(experimentId: string) {
    await this.assertExperimentExists(experimentId);
    return this.variantRepository.find({ where: { experimentId } });
  }

  async findOne(experimentId: string, id: string) {
    const variant = await this.variantRepository.findOneBy({
      id,
      experimentId,
    });
    if (!variant) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
    return variant;
  }

  async update(experimentId: string, id: string, dto: UpdateVariantDto) {
    const variant = await this.variantRepository.findOneBy({
      id,
      experimentId,
    });
    if (!variant) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
    Object.assign(variant, dto);
    return this.variantRepository.save(variant);
  }

  async remove(experimentId: string, id: string) {
    const result = await this.variantRepository.delete({
      id,
      experimentId,
    });
    if (result.affected === 0) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
  }

  private async assertExperimentExists(experimentId: string) {
    const experiment = await this.experimentRepository.findOneBy({
      id: experimentId,
    });
    if (!experiment) {
      throw new NotFoundException(`Experiment ${experimentId} not found`);
    }
  }
}
