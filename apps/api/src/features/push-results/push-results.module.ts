import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';
import { GetResultsService } from '@/features/get-results/get-results.service';
import { PushResultsController } from './push-results.controller';
import { PushResultsService } from './push-results.service';
import { ResultsWebhookClient } from './results-webhook.client';
import {
  buildWebhookConfig,
  fetchWebhookHttp,
  WEBHOOK_CONFIG,
  WEBHOOK_HTTP,
} from './webhook.config';

@Module({
  imports: [ManageExperimentsModule, ConfigModule],
  controllers: [PushResultsController],
  providers: [
    PushResultsService,
    ResultsWebhookClient,
    GetResultsService,
    {
      provide: WEBHOOK_CONFIG,
      inject: [ConfigService],
      useFactory: buildWebhookConfig,
    },
    { provide: WEBHOOK_HTTP, useValue: fetchWebhookHttp },
  ],
})
export class PushResultsModule {}
