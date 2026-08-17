import { SearchCatalogService } from './search-catalog.service';
import type { SearchConfig } from '@/search/search.config';

const CONFIG: SearchConfig = {
  url: 'http://localhost:9200',
  experimentsIndex: 'splitlab-test-experiments',
  flagsIndex: 'splitlab-test-flags',
};

function createMockClient() {
  return { search: jest.fn() };
}

describe('SearchCatalogService', () => {
  let client: ReturnType<typeof createMockClient>;
  let service: SearchCatalogService;

  beforeEach(() => {
    client = createMockClient();
    service = new SearchCatalogService(client as never, CONFIG);
  });

  it('queries both indices with a projectId term filter when no type is given', async () => {
    client.search.mockResolvedValueOnce({
      hits: { total: { value: 0 }, hits: [] },
    });

    await service.search('project-1', { q: 'checkout' });

    const [request] = client.search.mock.calls[0] as [
      {
        index: string;
        query: {
          bool: { must: unknown[]; filter: { term: { projectId: string } }[] };
        };
        size: number;
      },
    ];
    expect(request.index).toEqual(
      `${CONFIG.experimentsIndex},${CONFIG.flagsIndex}`,
    );
    expect(request.query.bool.filter).toEqual([
      { term: { projectId: 'project-1' } },
    ]);
    expect(request.query.bool.must).toEqual([
      {
        multi_match: {
          query: 'checkout',
          fields: ['name', 'description', 'key'],
          fuzziness: 'AUTO',
        },
      },
    ]);
    expect(request.size).toEqual(20);
  });

  it('narrows to a single index when type is given', async () => {
    client.search.mockResolvedValueOnce({
      hits: { total: { value: 0 }, hits: [] },
    });

    await service.search('project-1', { q: 'checkout', type: 'experiment' });

    const [request] = client.search.mock.calls[0] as [{ index: string }];
    expect(request.index).toEqual(CONFIG.experimentsIndex);
  });

  it('narrows to the flags index when type is flag', async () => {
    client.search.mockResolvedValueOnce({
      hits: { total: { value: 0 }, hits: [] },
    });

    await service.search('project-1', { q: 'checkout', type: 'flag' });

    const [request] = client.search.mock.calls[0] as [{ index: string }];
    expect(request.index).toEqual(CONFIG.flagsIndex);
  });

  it('maps hits into a merged, score-ordered response', async () => {
    client.search.mockResolvedValueOnce({
      hits: {
        total: { value: 2 },
        hits: [
          {
            _index: CONFIG.experimentsIndex,
            _id: 'experiment-1',
            _score: 2.4,
            _source: {
              projectId: 'project-1',
              type: 'experiment',
              name: 'Checkout redesign',
              description: 'A/B test',
              status: 'running',
              flagId: null,
            },
          },
          {
            _index: CONFIG.flagsIndex,
            _id: 'flag-1',
            _score: 1.1,
            _source: {
              projectId: 'project-1',
              type: 'flag',
              key: 'new-checkout',
              description: null,
              enabled: true,
            },
          },
        ],
      },
    });

    const result = await service.search('project-1', { q: 'checkout' });

    expect(result).toEqual({
      query: 'checkout',
      total: 2,
      results: [
        {
          type: 'experiment',
          id: 'experiment-1',
          score: 2.4,
          name: 'Checkout redesign',
          description: 'A/B test',
          status: 'running',
        },
        {
          type: 'flag',
          id: 'flag-1',
          score: 1.1,
          key: 'new-checkout',
          description: null,
          enabled: true,
        },
      ],
    });
  });

  it('returns an empty result set with zero total when nothing matches', async () => {
    client.search.mockResolvedValueOnce({
      hits: { total: { value: 0 }, hits: [] },
    });

    const result = await service.search('project-1', { q: 'nothing-here' });

    expect(result).toEqual({ query: 'nothing-here', total: 0, results: [] });
  });
});
