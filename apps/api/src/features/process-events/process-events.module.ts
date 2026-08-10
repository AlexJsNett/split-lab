import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ProcessEventsProcessor } from './process-events.processor';
import { ReconcileFailedEventsService } from './reconcile-failed-events.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'events' })],
  providers: [ProcessEventsProcessor, ReconcileFailedEventsService],
})
export class ProcessEventsModule {}
