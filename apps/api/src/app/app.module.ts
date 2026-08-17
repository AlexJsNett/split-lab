import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyGuard } from '@/shared/guards/api-key.guard';
import { ProjectOwnershipGuard } from '@/shared/guards/project-ownership.guard';
import { DrizzleModule } from '@/db/drizzle.module';
import { SearchModule } from '@/search/search.module';
import { ManageProjectsModule } from '@/features/manage-projects/manage-projects.module';
import { ManageFlagsModule } from '@/features/manage-flags/manage-flags.module';
import { ManageVariantsModule } from '@/features/manage-variants/manage-variants.module';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';
import { AssignVariantModule } from '@/features/assign-variant/assign-variant.module';
import { LogConversionModule } from '@/features/log-conversion/log-conversion.module';
import { GetResultsModule } from '@/features/get-results/get-results.module';
import { PushResultsModule } from '@/features/push-results/push-results.module';
import { SearchCatalogModule } from '@/features/search-catalog/search-catalog.module';

// ScheduleModule/@nestjs/schedule and the reconciliation cron moved to
// apps/event-processor with M10 — this app only publishes events now, it no
// longer owns any queue/broker connection or the cron that reconciles it.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    DrizzleModule,
    SearchModule,
    ManageProjectsModule,
    ManageFlagsModule,
    ManageVariantsModule,
    ManageExperimentsModule,
    AssignVariantModule,
    LogConversionModule,
    GetResultsModule,
    PushResultsModule,
    SearchCatalogModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: ProjectOwnershipGuard },
  ],
})
export class AppModule {}
