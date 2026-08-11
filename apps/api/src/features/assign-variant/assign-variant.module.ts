import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ManageExperimentsModule } from '@/features/manage-experiments/manage-experiments.module';
import { AssignVariantService } from './assign-variant.service';
import { AssignVariantController } from './assign-variant.controller';

@Module({
  imports: [
    ManageExperimentsModule,
    // 'EVENTS_CLIENT' is a plain string DI token, not exported/shared —
    // same convention the old 'events' queue name followed (a literal
    // repeated per module, not a shared const). apps/event-processor is the
    // sole owner of the RabbitMQ topology (D5); noAssert: true means this
    // client never re-declares the queue itself, so a queue-argument
    // mismatch between the two sides can't crash the process (V9).
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
            persistent: true, // V5 — default is false
            noAssert: true, // V9 — the worker owns topology
          },
        }),
      },
    ]),
  ],
  controllers: [AssignVariantController],
  providers: [AssignVariantService],
})
export class AssignVariantModule {}
