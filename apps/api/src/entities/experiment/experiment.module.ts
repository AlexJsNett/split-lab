import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExperimentEntity } from './infrastructure/experiment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ExperimentEntity])],
  exports: [TypeOrmModule],
})
export class ExperimentModule {}
