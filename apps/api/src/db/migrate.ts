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
    // Opt-in only: local Docker Postgres has no TLS listener, but a managed
    // host reachable over the public internet (e.g. Render's external
    // hostname) refuses a plaintext connection outright. rejectUnauthorized
    // is false because these providers commonly present a cert Node's
    // default CA bundle won't validate — this only skips certificate-chain
    // trust, DB_USER/DB_PASSWORD auth is unaffected either way.
    ssl:
      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
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
