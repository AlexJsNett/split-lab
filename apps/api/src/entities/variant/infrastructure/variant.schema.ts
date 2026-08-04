import { sql } from 'drizzle-orm';
import { integer, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { experiments } from '../../experiment/infrastructure/experiment.schema';

export const variants = pgTable('variants', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  experimentId: uuid('experimentId')
    .notNull()
    .references(() => experiments.id),
  key: varchar('key').notNull(),
  weight: integer('weight').notNull(),
});
