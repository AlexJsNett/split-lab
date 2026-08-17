import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import {
  buildSearchConfig,
  ELASTICSEARCH,
  SEARCH_CONFIG,
} from './search.config';
import { SearchIndexerService } from './search-indexer.service';

// @Global(), mirrors DrizzleModule — search is a connection-level sibling of
// db/, not a per-feature concern. DI token holds the Client directly (unlike
// M11's WEBHOOK_HTTP wrapping): @elastic/elasticsearch's Client is a real
// class, mocks fine as { provide: ELASTICSEARCH, useValue: mockClient }, no
// interface indirection needed just because fetch is a bare global function
// (that was the actual reason for WEBHOOK_HTTP's wrapper).
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SEARCH_CONFIG,
      inject: [ConfigService],
      useFactory: buildSearchConfig,
    },
    {
      provide: ELASTICSEARCH,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Client({ node: config.getOrThrow<string>('ELASTICSEARCH_URL') }),
    },
    SearchIndexerService,
  ],
  exports: [SEARCH_CONFIG, ELASTICSEARCH, SearchIndexerService],
})
export class SearchModule implements OnModuleDestroy {
  constructor(@Inject(ELASTICSEARCH) private readonly client: Client) {}

  // Same reason DrizzleModule ends its pg.Pool: without this, e2e runs hang
  // on an open handle after each test file.
  async onModuleDestroy() {
    await this.client.close();
  }
}
