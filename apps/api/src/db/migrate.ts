import { config } from 'dotenv';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './src/migrations' });
  await pool.end();
  console.log(`Migrations applied to ${process.env.DB_NAME}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
