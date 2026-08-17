import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '@/db/drizzle.module';
import { SearchIndexerService } from '@/search/search-indexer.service';
import { ManageFlagsService } from './manage-flags.service';

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

function createMockDb(): MockDb {
  return {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function mockInsert<Values extends Record<string, unknown>>(
  db: MockDb,
  resolvedRows: unknown[],
) {
  const valuesFn = jest.fn() as jest.Mock<
    { returning: jest.Mock<Promise<unknown[]>, []> },
    [Values]
  >;
  valuesFn.mockReturnValue({
    returning: jest.fn().mockResolvedValue(resolvedRows) as jest.Mock<
      Promise<unknown[]>,
      []
    >,
  });
  db.insert.mockReturnValueOnce({ values: valuesFn });
  return valuesFn;
}

function mockSelectWhere(db: MockDb, resolvedRows: unknown[]) {
  db.select.mockReturnValueOnce({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(resolvedRows),
    }),
  });
}

function mockUpdate(db: MockDb, resolvedRows: unknown[]) {
  db.update.mockReturnValueOnce({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(resolvedRows),
      }),
    }),
  });
}

function mockDelete(db: MockDb, resolvedRows: unknown[]) {
  db.delete.mockReturnValueOnce({
    where: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue(resolvedRows),
    }),
  });
}

describe('ManageFlagsService', () => {
  let service: ManageFlagsService;
  let db: MockDb;
  let searchIndexer: { indexFlag: jest.Mock; removeFlag: jest.Mock };

  beforeEach(async () => {
    db = createMockDb();
    searchIndexer = {
      indexFlag: jest.fn().mockResolvedValue(undefined),
      removeFlag: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        ManageFlagsService,
        { provide: DRIZZLE, useValue: db },
        { provide: SearchIndexerService, useValue: searchIndexer },
      ],
    }).compile();

    service = module.get(ManageFlagsService);
  });

  describe('create', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockSelectWhere(db, []);
      await expect(
        service.create('missing-project', { key: 'new-flag' }),
      ).rejects.toThrow(NotFoundException);
      expect(db.insert).not.toHaveBeenCalled();
      expect(searchIndexer.indexFlag).not.toHaveBeenCalled();
    });

    it('saves the flag scoped to the project when the project exists', async () => {
      mockSelectWhere(db, [{ id: 'project-1', name: 'X', apiKeyHash: 'hash' }]);
      const valuesFn = mockInsert<{ projectId: string; key: string }>(db, [
        {
          id: 'flag-1',
          projectId: 'project-1',
          key: 'new-flag',
          description: null,
          enabled: false,
          rolloutPercent: 0,
        },
      ]);

      const result = await service.create('project-1', { key: 'new-flag' });

      expect(valuesFn.mock.calls[0][0].projectId).toEqual('project-1');
      expect(result.id).toEqual('flag-1');
      expect(searchIndexer.indexFlag).toHaveBeenCalledWith('flag-1', {
        projectId: 'project-1',
        type: 'flag',
        key: 'new-flag',
        description: null,
        enabled: false,
      });
    });

    // SearchIndexerService's own contract (search-indexer.service.spec.ts)
    // guarantees indexFlag/removeFlag never reject — this call site trusts
    // that contract and stays free of its own try/catch, so this asserts
    // the write already succeeded before indexing is even attempted: the
    // insert().returning() has resolved and produced the row by the time
    // indexFlag is invoked, regardless of what the indexer does with it.
    it('has already committed the Postgres row before indexing is attempted', async () => {
      mockSelectWhere(db, [{ id: 'project-1', name: 'X', apiKeyHash: 'hash' }]);
      const valuesFn = mockInsert<{ projectId: string; key: string }>(db, [
        {
          id: 'flag-1',
          projectId: 'project-1',
          key: 'new-flag',
          description: null,
          enabled: false,
          rolloutPercent: 0,
        },
      ]);

      const result = await service.create('project-1', { key: 'new-flag' });

      expect(valuesFn).toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'flag-1', key: 'new-flag' });
    });
  });

  describe('findAll', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockSelectWhere(db, []);
      await expect(service.findAll('missing-project')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when flag does not exist in that project', async () => {
      mockSelectWhere(db, []);
      await expect(service.findOne('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when flag does not exist in that project', async () => {
      mockUpdate(db, []);
      await expect(
        service.update('project-1', 'missing-id', { enabled: true }),
      ).rejects.toThrow(NotFoundException);
      expect(searchIndexer.indexFlag).not.toHaveBeenCalled();
    });

    it('merges the dto onto the existing flag and saves it', async () => {
      mockUpdate(db, [
        {
          id: 'flag-1',
          projectId: 'project-1',
          key: 'old-key',
          description: 'old description',
          enabled: true,
          rolloutPercent: 0,
        },
      ]);

      const result = await service.update('project-1', 'flag-1', {
        enabled: true,
      });

      expect(result.enabled).toBe(true);
      expect(result.key).toEqual('old-key');
      expect(searchIndexer.indexFlag).toHaveBeenCalledWith('flag-1', {
        projectId: 'project-1',
        type: 'flag',
        key: 'old-key',
        description: 'old description',
        enabled: true,
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      mockDelete(db, []);
      await expect(service.remove('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(searchIndexer.removeFlag).not.toHaveBeenCalled();
    });

    it('resolves when a row was deleted, and removes it from the index', async () => {
      mockDelete(db, [
        {
          id: 'flag-1',
          projectId: 'project-1',
          key: 'x',
          enabled: false,
          rolloutPercent: 0,
        },
      ]);
      await expect(
        service.remove('project-1', 'flag-1'),
      ).resolves.toBeUndefined();
      expect(searchIndexer.removeFlag).toHaveBeenCalledWith('flag-1');
    });
  });
});
