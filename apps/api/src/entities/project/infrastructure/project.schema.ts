import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  name: varchar('name').notNull(),
  apiKeyHash: varchar('apiKeyHash').notNull().unique(),
});
