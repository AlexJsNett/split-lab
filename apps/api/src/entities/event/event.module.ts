import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './infrastructure/event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EventEntity])],
  exports: [TypeOrmModule],
})
export class EventModule {}
