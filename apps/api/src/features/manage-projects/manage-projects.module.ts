import { Module } from '@nestjs/common';
import { ManageProjectsService } from './manage-projects.service';
import { ManageProjectsController } from './manage-projects.controller';
import { ProjectModule } from '@/entities/project/project.module';

@Module({
  imports: [ProjectModule],
  controllers: [ManageProjectsController],
  providers: [ManageProjectsService],
})
export class ManageProjectsModule {}
