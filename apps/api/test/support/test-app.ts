import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app/app.module';
import { DRIZZLE } from '../../src/db/drizzle.module';
import * as schema from '../../src/db/schema';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  // matches main.ts — DTO validation only kicks in with this pipe registered,
  // and main.ts's bootstrap never runs in an e2e test (createNestApplication
  // builds the app in-memory, no listen()), so it has to be set up here too.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

// One TRUNCATE across every table in the same statement handles the FK chain
// (events -> variants/experiments, experiments -> projects/feature_flags,
// feature_flags -> projects) without needing CASCADE or a truncation order.
export async function cleanDatabase(app: INestApplication<App>) {
  const db = app.get<NodePgDatabase<typeof schema>>(DRIZZLE);
  await db.execute(
    sql`TRUNCATE TABLE events, variants, experiments, feature_flags, projects RESTART IDENTITY CASCADE`,
  );
}

export interface TestProject {
  id: string;
  name: string;
  apiKey: string;
}

// Every e2e test needs at least one authenticated project to attach the
// `x-api-key` header — this is the real POST /projects endpoint (a
// @Public() route), not a DB shortcut, so it exercises the same creation
// path a real client would use.
export async function createTestProject(
  app: INestApplication<App>,
  name = 'Test Project',
): Promise<TestProject> {
  const response = await request(app.getHttpServer())
    .post('/projects')
    .send({ name })
    .expect(201);
  return response.body as TestProject;
}
