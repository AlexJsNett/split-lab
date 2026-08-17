import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { projects } from '../../project/infrastructure/project.schema';
import { featureFlags } from '../../feature-flag/infrastructure/feature-flag.schema';

export const experiments = pgTable('experiments', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  projectId: uuid('projectId')
    .notNull()
    .references(() => projects.id),
  flagId: uuid('flagId').references(() => featureFlags.id),
  name: varchar('name').notNull(),
  description: varchar('description'),
  status: varchar('status').notNull().default('draft'),
});
