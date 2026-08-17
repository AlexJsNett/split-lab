import { ConfigService } from '@nestjs/config';

export const SEARCH_CONFIG = Symbol('SEARCH_CONFIG');
// Defined alongside SEARCH_CONFIG (not in search.module.ts) so
// search-indexer.service.ts and search.module.ts can both import it from
// here without a circular import between the module file and the service
// it provides — the same reason webhook.config.ts holds both WEBHOOK_CONFIG
// and WEBHOOK_HTTP.
export const ELASTICSEARCH = Symbol('ELASTICSEARCH');

export interface SearchConfig {
  url: string;
  experimentsIndex: string;
  flagsIndex: string;
}

// Mirrors webhook.config.ts's buildWebhookConfig shape: getOrThrow so a
// missing env var fails at boot, not on the first search request. The index
// prefix (not the URL) is what gives e2e its isolation — one shared
// Elasticsearch instance, 'splitlab' vs 'splitlab-test' indices, same trick
// as RABBITMQ_QUEUE=events_test.
export function buildSearchConfig(config: ConfigService): SearchConfig {
  const url = config.getOrThrow<string>('ELASTICSEARCH_URL');
  const prefix = config.getOrThrow<string>('ELASTICSEARCH_INDEX_PREFIX');

  return {
    url,
    experimentsIndex: `${prefix}-experiments`,
    flagsIndex: `${prefix}-flags`,
  };
}
