import { Module } from '@nestjs/common';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';
import { LogConversionService } from './log-conversion.service';
import { LogConversionController } from './log-conversion.controller';

@Module({
  imports: [ManageExperimentsModule],
  controllers: [LogConversionController],
  providers: [LogConversionService],
})
export class LogConversionModule {}
