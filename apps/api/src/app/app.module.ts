import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectModule } from '@/entities/project/project.module';
import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';
import { FeatureFlagModule } from '@/entities/feature-flag/feature-flag.module';
import { FeatureFlagEntity } from '@/entities/feature-flag/infrastructure/feature-flag.entity';
import { ManageProjectsModule } from '@/features/manage-projects/manage-projects.module';

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
        entities: [ProjectEntity, FeatureFlagEntity],
        synchronize: false,
      }),
    }),
    ProjectModule,
    FeatureFlagModule,
    ManageProjectsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
