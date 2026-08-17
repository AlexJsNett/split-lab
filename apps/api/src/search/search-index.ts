import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

// Framework-free index settings/mappings — used by both search.module.ts's
// runtime code (indirectly, via reindex.ts) and reindex.ts's CLI. Kept as
// plain objects, not wrapped in a class, since there is no behavior here.
export const INDEX_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 0, // default 1 replica leaves a single-node cluster permanently "yellow"
};

// text = analyzed (full-text, ranked, typo-tolerant via the standard
// analyzer). keyword = exact-match filter, never scored. dynamic: 'strict'
// makes an unexpected field fail loudly instead of silently auto-mapping.
export const EXPERIMENTS_MAPPING: MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    projectId: { type: 'keyword' },
    type: { type: 'keyword' },
    name: { type: 'text' },
    description: { type: 'text' },
    status: { type: 'keyword' },
    flagId: { type: 'keyword' },
  },
};

export const FLAGS_MAPPING: MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    projectId: { type: 'keyword' },
    type: { type: 'keyword' },
    key: { type: 'text' },
    description: { type: 'text' },
    enabled: { type: 'boolean' },
  },
};

export interface ExperimentDocument {
  projectId: string;
  type: 'experiment';
  name: string;
  description: string | null;
  status: string;
  flagId: string | null;
}

export interface FlagDocument {
  projectId: string;
  type: 'flag';
  key: string;
  description: string | null;
  enabled: boolean;
}
