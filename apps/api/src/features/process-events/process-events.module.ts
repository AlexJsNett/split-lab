import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ProcessEventsProcessor } from './process-events.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'events' })],
  providers: [ProcessEventsProcessor],
})
export class ProcessEventsModule {}
