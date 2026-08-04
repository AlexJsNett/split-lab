import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '@/db/drizzle.module';
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

  beforeEach(async () => {
    db = createMockDb();

    const module = await Test.createTestingModule({
      providers: [ManageFlagsService, { provide: DRIZZLE, useValue: db }],
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
    });

    it('saves the flag scoped to the project when the project exists', async () => {
      mockSelectWhere(db, [{ id: 'project-1', name: 'X', apiKeyHash: 'hash' }]);
      const valuesFn = mockInsert<{ projectId: string; key: string }>(db, [
        {
          id: 'flag-1',
          projectId: 'project-1',
          key: 'new-flag',
          enabled: false,
          rolloutPercent: 0,
        },
      ]);

      const result = await service.create('project-1', { key: 'new-flag' });

      expect(valuesFn.mock.calls[0][0].projectId).toEqual('project-1');
      expect(result.id).toEqual('flag-1');
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
    });

    it('merges the dto onto the existing flag and saves it', async () => {
      mockUpdate(db, [
        {
          id: 'flag-1',
          projectId: 'project-1',
          key: 'old-key',
          enabled: true,
          rolloutPercent: 0,
        },
      ]);

      const result = await service.update('project-1', 'flag-1', {
        enabled: true,
      });

      expect(result.enabled).toBe(true);
      expect(result.key).toEqual('old-key');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      mockDelete(db, []);
      await expect(service.remove('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
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
    });
  });
});
