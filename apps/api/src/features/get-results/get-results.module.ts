import { Module } from '@nestjs/common';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';
import { GetResultsService } from './get-results.service';
import { GetResultsController } from './get-results.controller';

@Module({
  imports: [ManageExperimentsModule],
  controllers: [GetResultsController],
  providers: [GetResultsService],
})
export class GetResultsModule {}
