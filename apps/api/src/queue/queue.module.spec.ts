import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from './queue.module';

// forRootAsync only registers shared connection config for queues registered
// later (per feature module, via BullModule.registerQueue) — it doesn't open
// a Redis connection itself, so compiling this module in isolation is safe
// without a real Redis instance running.
describe('QueueModule', () => {
  it('compiles, reading REDIS_HOST/REDIS_PORT from ConfigService', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ REDIS_HOST: 'localhost', REDIS_PORT: 6379 })],
        }),
        QueueModule,
      ],
    }).compile();

    expect(module).toBeDefined();
  });
});
