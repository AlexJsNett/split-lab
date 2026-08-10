import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiKeyGuard } from '@/shared/guards/api-key.guard';
import { ProjectOwnershipGuard } from '@/shared/guards/project-ownership.guard';
import { DrizzleModule } from '@/db/drizzle.module';
import { QueueModule } from '@/queue/queue.module';
import { ManageProjectsModule } from '@/features/manage-projects/manage-projects.module';
import { ManageFlagsModule } from '@/features/manage-flags/manage-flags.module';
import { ManageVariantsModule } from '@/features/manage-variants/manage-variants.module';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';
import { AssignVariantModule } from '@/features/assign-variant/assign-variant.module';
import { LogConversionModule } from '@/features/log-conversion/log-conversion.module';
import { GetResultsModule } from '@/features/get-results/get-results.module';
import { ProcessEventsModule } from '@/features/process-events/process-events.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    ScheduleModule.forRoot(),
    DrizzleModule,
    QueueModule,
    ManageProjectsModule,
    ManageFlagsModule,
    ManageVariantsModule,
    ManageExperimentsModule,
    AssignVariantModule,
    LogConversionModule,
    GetResultsModule,
    ProcessEventsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: ProjectOwnershipGuard },
  ],
})
export class AppModule {}
