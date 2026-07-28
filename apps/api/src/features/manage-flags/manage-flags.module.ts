import { Module } from '@nestjs/common';
import { ManageFlagsService } from './manage-flags.service';
import { ManageFlagsController } from './manage-flags.controller';
import { FeatureFlagModule } from '@/entities/feature-flag/feature-flag.module';
import { ProjectModule } from '@/entities/project/project.module';

@Module({
  imports: [FeatureFlagModule, ProjectModule],
  controllers: [ManageFlagsController],
  providers: [ManageFlagsService],
})
export class ManageFlagsModule {}
