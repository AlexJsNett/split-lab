import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Connection-level BullMQ setup only — this does NOT register the 'events'
// queue itself. Each feature module that needs to produce or consume jobs
// calls BullModule.registerQueue({ name: 'events' }) on its own; @nestjs/bullmq
// lets multiple modules register the same queue name and share the one
// underlying Redis-backed queue, the same way DrizzleModule exports a single
// DRIZZLE connection every feature injects rather than each opening its own.
@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST'),
          port: config.get('REDIS_PORT'),
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
