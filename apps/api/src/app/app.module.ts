import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectModule } from '@/entities/project/project.module';
import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';
import { FeatureFlagModule } from '@/entities/feature-flag/feature-flag.module';
import { FeatureFlagEntity } from '@/entities/feature-flag/infrastructure/feature-flag.entity';
import { ExperimentModule } from '@/entities/experiment/experiment.module';
import { ExperimentEntity } from '@/entities/experiment/infrastructure/experiment.entity';
import { VariantModule } from '@/entities/variant/variant.module';
import { VariantEntity } from '@/entities/variant/infrastructure/variant.entity';
import { EventModule } from '@/entities/event/event.module';
import { EventEntity } from '@/entities/event/infrastructure/event.entity';
import { ManageProjectsModule } from '@/features/manage-projects/manage-projects.module';
import { ManageFlagsModule } from '@/features/manage-flags/manage-flags.module';
import { ManageVariantsModule } from '@/features/manage-variants/manage-variants.module';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get('DB_PORT'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        entities: [
          ProjectEntity,
          FeatureFlagEntity,
          ExperimentEntity,
          VariantEntity,
          EventEntity,
        ],
        synchronize: false,
      }),
    }),
    ProjectModule,
    FeatureFlagModule,
    ExperimentModule,
    VariantModule,
    EventModule,
    ManageProjectsModule,
    ManageFlagsModule,
    ManageVariantsModule,
    ManageExperimentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
