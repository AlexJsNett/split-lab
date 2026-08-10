import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';
import { AssignVariantService } from './assign-variant.service';
import { AssignVariantController } from './assign-variant.controller';

@Module({
  imports: [
    ManageExperimentsModule,
    BullModule.registerQueue({ name: 'events' }),
  ],
  controllers: [AssignVariantController],
  providers: [AssignVariantService],
})
export class AssignVariantModule {}
