import { experiments } from '@/entities/experiment/infrastructure/experiment.schema';
import { featureFlags } from '@/entities/feature-flag/infrastructure/feature-flag.schema';
import { reindexAll } from './reindex';

function createMockDb(experimentRows: unknown[], flagRows: unknown[]) {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn((table: unknown) => {
        if (table === experiments) {
          return Promise.resolve(experimentRows);
        }
        if (table === featureFlags) {
          return Promise.resolve(flagRows);
        }
        return Promise.resolve([]);
      }),
    }),
  };
}

function createMockEs(indexExists = false) {
  return {
    indices: {
      exists: jest.fn().mockResolvedValue(indexExists),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      refresh: jest.fn().mockResolvedValue({}),
    },
    bulk: jest.fn().mockResolvedValue({}),
  };
}

const CONFIG = {
  experimentsIndex: 'splitlab-test-experiments',
  flagsIndex: 'splitlab-test-flags',
};

describe('reindexAll', () => {
  it('creates fresh indices without deleting when none exist yet', async () => {
    const db = createMockDb([], []);
    const es = createMockEs(false);

    await reindexAll({ db: db as never, es: es as never, config: CONFIG });

    expect(es.indices.delete).not.toHaveBeenCalled();
    expect(es.indices.create).toHaveBeenCalledTimes(2);
    expect(es.indices.create).toHaveBeenCalledWith(
      expect.objectContaining({ index: CONFIG.experimentsIndex }),
    );
    expect(es.indices.create).toHaveBeenCalledWith(
      expect.objectContaining({ index: CONFIG.flagsIndex }),
    );
  });

  it('deletes an existing index before recreating it (mapping changes require this)', async () => {
    const db = createMockDb([], []);
    const es = createMockEs(true);

    await reindexAll({ db: db as never, es: es as never, config: CONFIG });

    expect(es.indices.delete).toHaveBeenCalledTimes(2);
    expect(es.indices.create).toHaveBeenCalledTimes(2);
  });

  it('bulk-loads experiment and flag rows with the Postgres UUID as _id', async () => {
    const experimentRows = [
      {
        id: 'experiment-1',
        projectId: 'project-1',
        name: 'Checkout redesign',
        description: 'desc',
        status: 'running',
        flagId: null,
      },
    ];
    const flagRows = [
      {
        id: 'flag-1',
        projectId: 'project-1',
        key: 'new-checkout',
        description: null,
        enabled: true,
      },
    ];
    const db = createMockDb(experimentRows, flagRows);
    const es = createMockEs(false);

    await reindexAll({ db: db as never, es: es as never, config: CONFIG });

    expect(es.bulk).toHaveBeenCalledTimes(2);
    expect(es.bulk).toHaveBeenCalledWith({
      operations: [
        { index: { _index: CONFIG.experimentsIndex, _id: 'experiment-1' } },
        {
          projectId: 'project-1',
          type: 'experiment',
          name: 'Checkout redesign',
          description: 'desc',
          status: 'running',
          flagId: null,
        },
      ],
    });
    expect(es.bulk).toHaveBeenCalledWith({
      operations: [
        { index: { _index: CONFIG.flagsIndex, _id: 'flag-1' } },
        {
          projectId: 'project-1',
          type: 'flag',
          key: 'new-checkout',
          description: null,
          enabled: true,
        },
      ],
    });
  });

  it('skips the bulk call entirely for an empty table', async () => {
    const db = createMockDb([], []);
    const es = createMockEs(false);

    await reindexAll({ db: db as never, es: es as never, config: CONFIG });

    expect(es.bulk).not.toHaveBeenCalled();
  });

  it('refreshes both indices after loading, and returns row counts', async () => {
    const db = createMockDb(
      [
        {
          id: 'e1',
          projectId: 'p1',
          name: 'X',
          description: null,
          status: 'draft',
          flagId: null,
        },
      ],
      [
        {
          id: 'f1',
          projectId: 'p1',
          key: 'a',
          description: null,
          enabled: false,
        },
        {
          id: 'f2',
          projectId: 'p1',
          key: 'b',
          description: null,
          enabled: false,
        },
      ],
    );
    const es = createMockEs(false);

    const counts = await reindexAll({
      db: db as never,
      es: es as never,
      config: CONFIG,
    });

    expect(es.indices.refresh).toHaveBeenCalledWith({
      index: `${CONFIG.experimentsIndex},${CONFIG.flagsIndex}`,
    });
    expect(counts).toEqual({ experiments: 1, flags: 2 });
  });
});
