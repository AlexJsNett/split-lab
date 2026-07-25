import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureFlagEntity } from './infrastructure/feature-flag.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureFlagEntity])],
  exports: [TypeOrmModule],
})
export class FeatureFlagModule {}
