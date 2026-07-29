import { Module } from '@nestjs/common';
import { ManageExperimentsService } from './manage-experiments.service';
import { ManageExperimentsController } from './manage-experiments.controller';
import { ExperimentModule } from '@/entities/experiment/experiment.module';
import { ProjectModule } from '@/entities/project/project.module';
import { VariantModule } from '@/entities/variant/variant.module';

@Module({
  imports: [ExperimentModule, ProjectModule, VariantModule],
  controllers: [ManageExperimentsController],
  providers: [ManageExperimentsService],
})
export class ManageExperimentsModule {}
