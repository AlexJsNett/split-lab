import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from './infrastructure/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectEntity])],
  exports: [TypeOrmModule],
})
export class ProjectModule {}
