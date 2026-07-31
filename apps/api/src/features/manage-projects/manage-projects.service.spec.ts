import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/db/prisma.service';
import { ManageProjectsService } from './manage-projects.service';

type MockPrisma = {
  project: {
    create: jest.Mock<
      Promise<unknown>,
      [{ data: { name: string; apiKeyHash: string } }]
    >;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    updateManyAndReturn: jest.Mock;
    deleteMany: jest.Mock;
  };
};

function createMockPrisma(): MockPrisma {
  return {
    project: {
      create: jest.fn<
        Promise<unknown>,
        [{ data: { name: string; apiKeyHash: string } }]
      >(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateManyAndReturn: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

describe('ManageProjectsService', () => {
  let service: ManageProjectsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ManageProjectsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ManageProjectsService);
  });

  describe('create', () => {
    it('saves a hash, not the raw key, and returns the raw key exactly once', async () => {
      prisma.project.create.mockResolvedValueOnce({
        id: 'uuid-1',
        name: 'Test',
        apiKeyHash: 'hash-placeholder',
      });

      const result = await service.create({ name: 'Test' });

      const savedArg = prisma.project.create.mock.calls[0][0].data;
      expect(savedArg.apiKeyHash).toEqual(expect.any(String));
      expect(savedArg.apiKeyHash).not.toEqual(result.apiKey);
      expect(result).not.toHaveProperty('apiKeyHash');
    });
  });

  describe('findAll', () => {
    it('never returns apiKeyHash for any project', async () => {
      prisma.project.findMany.mockResolvedValueOnce([
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
      prisma.project.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('never returns apiKeyHash when found', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({
        id: '1',
        name: 'X',
        apiKeyHash: 'secret-hash',
      });
      const result = await service.findOne('1');
      expect(result).toEqual({ id: '1', name: 'X' });
      expect(result).not.toHaveProperty('apiKeyHash');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when project does not exist', async () => {
      prisma.project.updateManyAndReturn.mockResolvedValueOnce([]);
      await expect(
        service.update('missing-id', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      prisma.project.deleteMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
      prisma.project.deleteMany.mockResolvedValueOnce({ count: 1 });
      await expect(service.remove('1')).resolves.toBeUndefined();
    });
  });
});
