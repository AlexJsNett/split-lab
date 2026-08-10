import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';
import { LogConversionService } from './log-conversion.service';
import { LogConversionController } from './log-conversion.controller';

@Module({
  imports: [
    ManageExperimentsModule,
    BullModule.registerQueue({ name: 'events' }),
  ],
  controllers: [LogConversionController],
  providers: [LogConversionService],
})
export class LogConversionModule {}
