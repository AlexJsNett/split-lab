import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariantEntity } from './infrastructure/variant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VariantEntity])],
  exports: [TypeOrmModule],
})
export class VariantModule {}
