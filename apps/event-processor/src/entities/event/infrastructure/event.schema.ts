import { sql } from 'drizzle-orm';
import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// Minimal mirror of apps/api's events table — 5 columns, no .references().
// FK enforcement (experimentId -> experiments.id, variantId -> variants.id)
// lives in the database itself, declared by apps/api's own migrations, which
// keeps sole ownership of the schema and its migrations (D3, M10 plan). This
// worker needs exactly one capability — INSERT one row into this table — not
// the full relational picture. Column parity with apps/api's definition is
// covered by an explicit test (see event.schema.spec.ts), the tripwire for
// the two definitions drifting.
export const events = pgTable('events', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  experimentId: uuid('experimentId').notNull(),
  variantId: uuid('variantId').notNull(),
  userId: varchar('userId').notNull(),
  type: varchar('type').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});
