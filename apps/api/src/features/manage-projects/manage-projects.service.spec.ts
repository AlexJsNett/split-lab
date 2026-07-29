import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '@/db/drizzle.module';
import { ManageProjectsService } from './manage-projects.service';

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

function mockSelectFrom(db: MockDb, resolvedRows: unknown[]) {
  db.select.mockReturnValueOnce({
    from: jest.fn().mockResolvedValue(resolvedRows),
  });
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

describe('ManageProjectsService', () => {
  let service: ManageProjectsService;
  let db: MockDb;

  beforeEach(async () => {
    db = createMockDb();

    const module = await Test.createTestingModule({
      providers: [ManageProjectsService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get(ManageProjectsService);
  });

  describe('create', () => {
    it('saves a hash, not the raw key, and returns the raw key exactly once', async () => {
      const valuesFn = mockInsert<{ name: string; apiKeyHash: string }>(db, [
        { id: 'uuid-1', name: 'Test', apiKeyHash: 'hash-placeholder' },
      ]);

      const result = await service.create({ name: 'Test' });

      const savedArg = valuesFn.mock.calls[0][0];
      expect(savedArg.apiKeyHash).toEqual(expect.any(String));
      expect(savedArg.apiKeyHash).not.toEqual(result.apiKey);
      expect(result).not.toHaveProperty('apiKeyHash');
    });
  });

  describe('findAll', () => {
    it('never returns apiKeyHash for any project', async () => {
      mockSelectFrom(db, [
        { id: '1', name: 'X', apiKeyHash: 'hash-1' },
        { id: '2', name: 'Y', apiKeyHash: 'hash-2' },
      ]);

      const result = await service.findAll();

      expect(result).toEqual([
        { id: '1', name: 'X' },
        { id: '2', name: 'Y' },
      ]);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockSelectWhere(db, []);
      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('never returns apiKeyHash when found', async () => {
      mockSelectWhere(db, [{ id: '1', name: 'X', apiKeyHash: 'secret-hash' }]);
      const result = await service.findOne('1');
      expect(result).toEqual({ id: '1', name: 'X' });
      expect(result).not.toHaveProperty('apiKeyHash');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockUpdate(db, []);
      await expect(
        service.update('missing-id', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      mockDelete(db, []);
      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
      mockDelete(db, [{ id: '1', name: 'X', apiKeyHash: 'hash' }]);
      await expect(service.remove('1')).resolves.toBeUndefined();
    });
  });
});
