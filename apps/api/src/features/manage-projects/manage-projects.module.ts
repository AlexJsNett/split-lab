import { Module } from '@nestjs/common';
import { ManageProjectsService } from './manage-projects.service';
import { ManageProjectsController } from './manage-projects.controller';

@Module({
  controllers: [ManageProjectsController],
  providers: [ManageProjectsService],
})
export class ManageProjectsModule {}
