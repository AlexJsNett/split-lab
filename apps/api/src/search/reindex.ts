import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from '@elastic/elasticsearch';
import * as schema from '@/db/schema';
import { experiments } from '@/entities/experiment/infrastructure/experiment.schema';
import { featureFlags } from '@/entities/feature-flag/infrastructure/feature-flag.schema';
import {
  EXPERIMENTS_MAPPING,
  ExperimentDocument,
  FLAGS_MAPPING,
  FlagDocument,
  INDEX_SETTINGS,
} from './search-index';

loadEnv({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

export interface ReindexConfig {
  experimentsIndex: string;
  flagsIndex: string;
}

export interface ReindexDeps {
  db: NodePgDatabase<typeof schema>;
  es: Client;
  config: ReindexConfig;
}

export interface ReindexCounts {
  experiments: number;
  flags: number;
}

// CLI owns index creation, not app boot — consistent with "Postgres schema
// is created by migration:run, never at boot." Delete-and-recreate (not
// upsert-in-place) is correct because this is also how a mapping change
// gets applied: ES mappings are largely immutable once created. Exported so
// the bulk-building logic is unit-testable without a real cluster/DB.
export async function reindexAll({
  db,
  es,
  config,
}: ReindexDeps): Promise<ReindexCounts> {
  await recreateIndex(es, config.experimentsIndex, EXPERIMENTS_MAPPING);
  await recreateIndex(es, config.flagsIndex, FLAGS_MAPPING);

  const experimentRows = await db.select().from(experiments);
  const flagRows = await db.select().from(featureFlags);

  await bulkIndex(
    es,
    config.experimentsIndex,
    experimentRows.map((row) => ({
      id: row.id,
      document: {
        projectId: row.projectId,
        type: 'experiment',
        name: row.name,
        description: row.description,
        status: row.status,
        flagId: row.flagId,
      } satisfies ExperimentDocument,
    })),
  );

  await bulkIndex(
    es,
    config.flagsIndex,
    flagRows.map((row) => ({
      id: row.id,
      document: {
        projectId: row.projectId,
        type: 'flag',
        key: row.key,
        description: row.description,
        enabled: row.enabled,
      } satisfies FlagDocument,
    })),
  );

  await es.indices.refresh({
    index: `${config.experimentsIndex},${config.flagsIndex}`,
  });

  return { experiments: experimentRows.length, flags: flagRows.length };
}

async function recreateIndex(
  es: Client,
  index: string,
  mappings: typeof EXPERIMENTS_MAPPING,
) {
  const exists = await es.indices.exists({ index });
  if (exists) {
    await es.indices.delete({ index });
  }
  await es.indices.create({ index, mappings, settings: INDEX_SETTINGS });
}

async function bulkIndex(
  es: Client,
  index: string,
  docs: { id: string; document: ExperimentDocument | FlagDocument }[],
) {
  if (docs.length === 0) {
    return;
  }
  const operations = docs.flatMap(({ id, document }) => [
    { index: { _index: index, _id: id } },
    document,
  ]);
  await es.bulk({ operations });
}

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const db = drizzle(pool, { schema });
  const es = new Client({ node: process.env.ELASTICSEARCH_URL });
  const prefix = process.env.ELASTICSEARCH_INDEX_PREFIX;
  const config: ReindexConfig = {
    experimentsIndex: `${prefix}-experiments`,
    flagsIndex: `${prefix}-flags`,
  };

  const counts = await reindexAll({ db, es, config });
  console.log(
    `Reindexed ${counts.experiments} experiment(s) into '${config.experimentsIndex}'.`,
  );
  console.log(`Reindexed ${counts.flags} flag(s) into '${config.flagsIndex}'.`);

  await pool.end();
  await es.close();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
