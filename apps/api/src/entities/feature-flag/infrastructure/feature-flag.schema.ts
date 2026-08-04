import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { projects } from '../../project/infrastructure/project.schema';

export const featureFlags = pgTable('feature_flags', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  projectId: uuid('projectId')
    .notNull()
    .references(() => projects.id),
  key: varchar('key').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  rolloutPercent: integer('rolloutPercent').notNull().default(0),
});
