import { Module } from '@nestjs/common';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';
import { AssignVariantService } from './assign-variant.service';
import { AssignVariantController } from './assign-variant.controller';

@Module({
  imports: [ManageExperimentsModule],
  controllers: [AssignVariantController],
  providers: [AssignVariantService],
})
export class AssignVariantModule {}
