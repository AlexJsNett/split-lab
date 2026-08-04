import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '@/db/drizzle.module';
import { ManageExperimentsService } from './manage-experiments.service';

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

describe('ManageExperimentsService', () => {
  let service: ManageExperimentsService;
  let db: MockDb;

  beforeEach(async () => {
    db = createMockDb();

    const module = await Test.createTestingModule({
      providers: [ManageExperimentsService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get(ManageExperimentsService);
  });

  describe('create', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockSelectWhere(db, []);
      await expect(
        service.create('missing-project', { name: 'Checkout test' }),
      ).rejects.toThrow(NotFoundException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('saves the experiment scoped to the project when it exists', async () => {
      mockSelectWhere(db, [{ id: 'project-1', name: 'X', apiKeyHash: 'hash' }]);
      const valuesFn = mockInsert<{ projectId: string; name: string }>(db, [
        {
          id: 'experiment-1',
          projectId: 'project-1',
          flagId: null,
          name: 'Checkout test',
          status: 'draft',
        },
      ]);

      const result = await service.create('project-1', {
        name: 'Checkout test',
      });

      expect(valuesFn.mock.calls[0][0].projectId).toEqual('project-1');
      expect(result.id).toEqual('experiment-1');
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
    it('throws NotFoundException when experiment does not exist in that project', async () => {
      mockSelectWhere(db, []);
      await expect(service.findOne('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when experiment does not exist in that project', async () => {
      mockSelectWhere(db, []);
      await expect(
        service.update('project-1', 'missing-id', { name: 'New name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates fields that are not status without touching variants', async () => {
      mockSelectWhere(db, [
        {
          id: 'experiment-1',
          projectId: 'project-1',
          flagId: null,
          name: 'Old name',
          status: 'draft',
        },
      ]);
      mockUpdate(db, [
        {
          id: 'experiment-1',
          projectId: 'project-1',
          flagId: null,
          name: 'New name',
          status: 'draft',
        },
      ]);

      const result = await service.update('project-1', 'experiment-1', {
        name: 'New name',
      });

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(result.name).toEqual('New name');
      expect(result.status).toEqual('draft');
    });

    it('throws BadRequestException when moving to running and weights do not sum to 100', async () => {
      mockSelectWhere(db, [
        {
          id: 'experiment-1',
          projectId: 'project-1',
          flagId: null,
          name: 'X',
          status: 'draft',
        },
      ]);
      mockSelectWhere(db, [
        { id: 'v1', experimentId: 'experiment-1', key: 'control', weight: 50 },
      ]);

      await expect(
        service.update('project-1', 'experiment-1', { status: 'running' }),
      ).rejects.toThrow(BadRequestException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('moves to running when weights sum to exactly 100', async () => {
      mockSelectWhere(db, [
        {
          id: 'experiment-1',
          projectId: 'project-1',
          flagId: null,
          name: 'X',
          status: 'draft',
        },
      ]);
      mockSelectWhere(db, [
        { id: 'v1', experimentId: 'experiment-1', key: 'control', weight: 50 },
        {
          id: 'v2',
          experimentId: 'experiment-1',
          key: 'treatment',
          weight: 50,
        },
      ]);
      mockUpdate(db, [
        {
          id: 'experiment-1',
          projectId: 'project-1',
          flagId: null,
          name: 'X',
          status: 'running',
        },
      ]);

      const result = await service.update('project-1', 'experiment-1', {
        status: 'running',
      });

      expect(result.status).toEqual('running');
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
          id: 'experiment-1',
          projectId: 'project-1',
          flagId: null,
          name: 'X',
          status: 'draft',
        },
      ]);
      await expect(
        service.remove('project-1', 'experiment-1'),
      ).resolves.toBeUndefined();
    });
  });
});
