import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DrizzleModule } from '@/db/drizzle.module';
import { ProcessEventsModule } from '@/features/process-events/process-events.module';
import { HealthModule } from '@/features/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    ScheduleModule.forRoot(),
    DrizzleModule,
    HealthModule,
    ProcessEventsModule,
  ],
})
export class AppModule {}
