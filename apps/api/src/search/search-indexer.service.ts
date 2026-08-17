import { Inject, Injectable, Logger } from '@nestjs/common';
import { Client, errors } from '@elastic/elasticsearch';
import { ELASTICSEARCH, SEARCH_CONFIG } from './search.config';
import type { SearchConfig } from './search.config';
import { ExperimentDocument, FlagDocument } from './search-index';

// Contract: every method returns Promise<void> and never rejects. All
// try/catch + Logger.error lives here so call sites (manage-experiments/
// manage-flags services) stay clean and "ES failure must never fail the
// user's request" is enforced — and unit-tested — in exactly one place.
// A failed write leaves the index stale until the next `search:reindex`;
// that's an accepted trade-off (search.md), not a bug.
@Injectable()
export class SearchIndexerService {
  private readonly logger = new Logger(SearchIndexerService.name);

  constructor(
    @Inject(ELASTICSEARCH) private readonly client: Client,
    @Inject(SEARCH_CONFIG) private readonly config: SearchConfig,
  ) {}

  async indexExperiment(
    id: string,
    document: ExperimentDocument,
  ): Promise<void> {
    await this.index(this.config.experimentsIndex, id, document);
  }

  async indexFlag(id: string, document: FlagDocument): Promise<void> {
    await this.index(this.config.flagsIndex, id, document);
  }

  async removeExperiment(id: string): Promise<void> {
    await this.remove(this.config.experimentsIndex, id);
  }

  async removeFlag(id: string): Promise<void> {
    await this.remove(this.config.flagsIndex, id);
  }

  // Elasticsearch's own `action.auto_create_index` defaults to ON — a
  // client.index() call against a missing index does NOT throw
  // index_not_found_exception the way delete/search do, it silently
  // auto-creates the index with a *dynamic* mapping instead (verified live:
  // this actually happened, `projectId` came back mapped as analyzed `text`
  // instead of `keyword`, silently breaking every `term` filter). Checking
  // `indices.exists()` first closes that gap deterministically, regardless
  // of cluster-level auto-create settings — the one case where an extra
  // round-trip before the write is worth it, since "succeed into a broken
  // mapping" is strictly worse than "skip and log."
  private async index(
    index: string,
    id: string,
    document: ExperimentDocument | FlagDocument,
  ): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index });
      if (!exists) {
        this.logMissingIndex(index, 'index', id);
        return;
      }
      await this.client.index({ index, id, document });
    } catch (error) {
      this.logFailure(error, 'index', index, id);
    }
  }

  private async remove(index: string, id: string): Promise<void> {
    try {
      await this.client.delete({ index, id });
    } catch (error) {
      if (this.isIndexNotFound(error)) {
        this.logMissingIndex(index, 'delete', id);
        return;
      }
      // 404 for a document that's simply already gone is a success from
      // the caller's point of view — nothing left to remove either way.
      if (error instanceof errors.ResponseError && error.statusCode === 404) {
        return;
      }
      this.logFailure(error, 'delete', index, id);
    }
  }

  private logMissingIndex(
    index: string,
    op: 'index' | 'delete',
    id: string,
  ): void {
    this.logger.error(
      `Elasticsearch index '${index}' is missing — run 'pnpm run search:reindex' (${op} of document ${id} skipped)`,
    );
  }

  private logFailure(
    error: unknown,
    op: 'index' | 'delete',
    index: string,
    id: string,
  ): void {
    if (this.isIndexNotFound(error)) {
      this.logMissingIndex(index, op, id);
      return;
    }
    this.logger.error(
      `Elasticsearch ${op} failed for document ${id} in '${index}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  private isIndexNotFound(error: unknown): boolean {
    if (!(error instanceof errors.ResponseError)) {
      return false;
    }
    const body = error.body as { error?: { type?: string } } | undefined;
    return body?.error?.type === 'index_not_found_exception';
  }
}
