import { sql } from 'drizzle-orm';
import {
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { experiments } from '../../experiment/infrastructure/experiment.schema';

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  experimentId: uuid('experimentId')
    .notNull()
    .references(() => experiments.id),
  idempotencyKey: varchar('idempotencyKey').notNull().unique(),
  status: varchar('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  responseStatus: integer('responseStatus'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  deliveredAt: timestamp('deliveredAt'),
});
