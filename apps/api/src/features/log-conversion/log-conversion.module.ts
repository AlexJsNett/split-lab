import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';
import { LogConversionService } from './log-conversion.service';
import { LogConversionController } from './log-conversion.controller';

@Module({
  imports: [
    ManageExperimentsModule,
    // Same registerAsync block as assign-variant.module.ts — duplicated, not
    // shared, matching the old per-module BullModule.registerQueue({ name:
    // 'events' }) precedent. See that module for the noAssert/persistent
    // reasoning.
    ClientsModule.registerAsync([
      {
        name: 'EVENTS_CLIENT',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: config.getOrThrow<string>('RABBITMQ_QUEUE'),
            persistent: true,
            noAssert: true,
          },
        }),
      },
    ]),
  ],
  controllers: [LogConversionController],
  providers: [LogConversionService],
})
export class LogConversionModule {}
