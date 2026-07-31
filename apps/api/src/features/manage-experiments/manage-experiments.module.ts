import { Module } from '@nestjs/common';
import { ManageExperimentsService } from './manage-experiments.service';
import { ManageExperimentsController } from './manage-experiments.controller';

@Module({
  controllers: [ManageExperimentsController],
  providers: [ManageExperimentsService],
  exports: [ManageExperimentsService],
})
export class ManageExperimentsModule {}
