import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Own connection, own Pool — deliberately NOT shared with apps/api (D3 in the
// M10 plan). Same shape as apps/api's DrizzleModule (Symbol token, @Global(),
// OnModuleDestroy closing the pool) since that pattern already proved itself
// there; this is a second, independent instance of it, not an import of it.
export const DRIZZLE = Symbol('DRIZZLE');
const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({
          host: config.get('DB_HOST'),
          port: config.get('DB_PORT'),
          user: config.get('DB_USER'),
          password: config.get('DB_PASSWORD'),
          database: config.get('DB_NAME'),
        }),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // Same reasoning as apps/api: without this, e2e test files leave a dangling
  // open pg connection behind after app.close(), which hangs a multi-file suite.
  async onModuleDestroy() {
    await this.pool.end();
  }
}
