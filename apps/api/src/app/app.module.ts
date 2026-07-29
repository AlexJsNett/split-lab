import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from '@/db/drizzle.module';
import { ManageProjectsModule } from '@/features/manage-projects/manage-projects.module';
import { ManageFlagsModule } from '@/features/manage-flags/manage-flags.module';
import { ManageVariantsModule } from '@/features/manage-variants/manage-variants.module';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    DrizzleModule,
    ManageProjectsModule,
    ManageFlagsModule,
    ManageVariantsModule,
    ManageExperimentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
