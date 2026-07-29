import { sql } from 'drizzle-orm';
import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { experiments } from '../../experiment/infrastructure/experiment.schema';
import { variants } from '../../variant/infrastructure/variant.schema';

export const events = pgTable('events', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  experimentId: uuid('experimentId')
    .notNull()
    .references(() => experiments.id),
  variantId: uuid('variantId')
    .notNull()
    .references(() => variants.id),
  userId: varchar('userId').notNull(),
  type: varchar('type').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});
