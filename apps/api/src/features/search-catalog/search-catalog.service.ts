import { Inject, Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { SearchHit } from '@elastic/elasticsearch/lib/api/types';
import { ELASTICSEARCH, SEARCH_CONFIG } from '@/search/search.config';
import type { SearchConfig } from '@/search/search.config';
import type { ExperimentDocument, FlagDocument } from '@/search/search-index';
import { SearchQueryDto } from './dto/search-query.dto';

const RESULT_SIZE = 20;

export interface ExperimentSearchResult {
  type: 'experiment';
  id: string;
  score: number;
  name: string;
  description: string | null;
  status: string;
}

export interface FlagSearchResult {
  type: 'flag';
  id: string;
  score: number;
  key: string;
  description: string | null;
  enabled: boolean;
}

export type SearchResultItem = ExperimentSearchResult | FlagSearchResult;

export interface SearchResponse {
  query: string;
  total: number;
  results: SearchResultItem[];
}

@Injectable()
export class SearchCatalogService {
  constructor(
    @Inject(ELASTICSEARCH) private readonly client: Client,
    @Inject(SEARCH_CONFIG) private readonly config: SearchConfig,
  ) {}

  // multi_match with a parameterized query string, never query_string — the
  // latter lets user input carry Lucene syntax and expensive leading
  // wildcards, a security decision, not a style one. fuzziness: 'AUTO' is
  // the one relevance feature worth having here (typo-tolerant, ranked) —
  // the concrete reason this isn't just Postgres LIKE '%q%'.
  async search(
    projectId: string,
    dto: SearchQueryDto,
  ): Promise<SearchResponse> {
    const response = await this.client.search<
      ExperimentDocument | FlagDocument
    >({
      index: this.resolveIndex(dto.type),
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: dto.q,
                fields: ['name', 'description', 'key'],
                fuzziness: 'AUTO',
              },
            },
          ],
          filter: [{ term: { projectId } }],
        },
      },
      size: RESULT_SIZE,
    });

    const results = response.hits.hits.map((hit) => this.toResultItem(hit));
    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : (response.hits.total?.value ?? results.length);

    return { query: dto.q, total, results };
  }

  private resolveIndex(type: 'experiment' | 'flag' | undefined): string {
    if (type === 'experiment') {
      return this.config.experimentsIndex;
    }
    if (type === 'flag') {
      return this.config.flagsIndex;
    }
    return `${this.config.experimentsIndex},${this.config.flagsIndex}`;
  }

  private toResultItem(
    hit: SearchHit<ExperimentDocument | FlagDocument>,
  ): SearchResultItem {
    const source = hit._source;
    if (!source) {
      throw new Error(`Search hit ${hit._id} missing _source`);
    }
    const id = hit._id ?? '';
    const score = hit._score ?? 0;

    if (source.type === 'experiment') {
      return {
        type: 'experiment',
        id,
        score,
        name: source.name,
        description: source.description,
        status: source.status,
      };
    }
    return {
      type: 'flag',
      id,
      score,
      key: source.key,
      description: source.description,
      enabled: source.enabled,
    };
  }
}
