import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '@/db/drizzle.module';
import { ManageVariantsService } from './manage-variants.service';

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

const ownedExperiment = {
  id: 'experiment-1',
  projectId: 'project-1',
  flagId: null,
  name: 'X',
  status: 'draft',
};

describe('ManageVariantsService', () => {
  let service: ManageVariantsService;
  let db: MockDb;

  beforeEach(async () => {
    db = createMockDb();

    const module = await Test.createTestingModule({
      providers: [ManageVariantsService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get(ManageVariantsService);
  });

  describe('create', () => {
    it('throws NotFoundException when experiment does not exist', async () => {
      mockSelectWhere(db, []);
      await expect(
        service.create('project-1', 'missing-experiment', {
          key: 'control',
          weight: 50,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the experiment belongs to another project', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      await expect(
        service.create('someone-elses-project', 'experiment-1', {
          key: 'control',
          weight: 50,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('saves the variant scoped to the experiment when it exists and is owned', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      const valuesFn = mockInsert<{ experimentId: string; key: string }>(db, [
        {
          id: 'variant-1',
          experimentId: 'experiment-1',
          key: 'control',
          weight: 50,
        },
      ]);

      const result = await service.create('project-1', 'experiment-1', {
        key: 'control',
        weight: 50,
      });

      expect(valuesFn.mock.calls[0][0].experimentId).toEqual('experiment-1');
      expect(result.id).toEqual('variant-1');
    });
  });

  describe('findAll', () => {
    it('throws NotFoundException when experiment does not exist', async () => {
      mockSelectWhere(db, []);
      await expect(
        service.findAll('project-1', 'missing-experiment'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the experiment belongs to another project', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      await expect(
        service.findAll('someone-elses-project', 'experiment-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when experiment does not exist', async () => {
      mockSelectWhere(db, []);
      await expect(
        service.findOne('project-1', 'missing-experiment', 'variant-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the experiment belongs to another project', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      await expect(
        service.findOne('someone-elses-project', 'experiment-1', 'variant-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when variant does not exist in that experiment', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      mockSelectWhere(db, []);
      await expect(
        service.findOne('project-1', 'experiment-1', 'missing-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws ForbiddenException when the experiment belongs to another project', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      await expect(
        service.update('someone-elses-project', 'experiment-1', 'variant-1', {
          weight: 60,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when variant does not exist in that experiment', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      mockUpdate(db, []);
      await expect(
        service.update('project-1', 'experiment-1', 'missing-id', {
          weight: 60,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('merges the dto onto the existing variant and saves it', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      mockUpdate(db, [
        {
          id: 'variant-1',
          experimentId: 'experiment-1',
          key: 'control',
          weight: 60,
        },
      ]);

      const result = await service.update(
        'project-1',
        'experiment-1',
        'variant-1',
        { weight: 60 },
      );

      expect(result.weight).toBe(60);
      expect(result.key).toEqual('control');
    });
  });

  describe('remove', () => {
    it('throws ForbiddenException when the experiment belongs to another project', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      await expect(
        service.remove('someone-elses-project', 'experiment-1', 'variant-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when nothing was deleted', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      mockDelete(db, []);
      await expect(
        service.remove('project-1', 'experiment-1', 'missing-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('resolves when a row was deleted', async () => {
      mockSelectWhere(db, [ownedExperiment]);
      mockDelete(db, [
        {
          id: 'variant-1',
          experimentId: 'experiment-1',
          key: 'control',
          weight: 50,
        },
      ]);
      await expect(
        service.remove('project-1', 'experiment-1', 'variant-1'),
      ).resolves.toBeUndefined();
    });
  });
});
