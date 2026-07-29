import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { CreateExperimentDto } from './create-experiment.dto';
import type { ExperimentStatus } from '@/entities/experiment/domain/experiment';

export class UpdateExperimentDto extends PartialType(CreateExperimentDto) {
  @IsOptional()
  @IsIn(['draft', 'running', 'completed'])
  status?: ExperimentStatus;
}
