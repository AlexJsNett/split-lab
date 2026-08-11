import { Module } from '@nestjs/common';
import { ProcessEventsController } from './process-events.controller';
import { ReconcileParkedEventsService } from './reconcile-parked-events.service';

@Module({
  controllers: [ProcessEventsController],
  providers: [ReconcileParkedEventsService],
})
export class ProcessEventsModule {}
