import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/db/prisma.service';
import { ManageFlagsService } from './manage-flags.service';

type MockPrisma = {
  project: {
    findUnique: jest.Mock;
  };
  featureFlag: {
    create: jest.Mock<
      Promise<unknown>,
      [{ data: { projectId: string; key: string } }]
    >;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateManyAndReturn: jest.Mock;
    deleteMany: jest.Mock;
  };
};

function createMockPrisma(): MockPrisma {
  return {
    project: {
      findUnique: jest.fn(),
    },
    featureFlag: {
      create: jest.fn<
        Promise<unknown>,
        [{ data: { projectId: string; key: string } }]
      >(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateManyAndReturn: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

describe('ManageFlagsService', () => {
  let service: ManageFlagsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ManageFlagsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ManageFlagsService);
  });

  describe('create', () => {
    it('throws NotFoundException when project does not exist', async () => {
      prisma.project.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.create('missing-project', { key: 'new-flag' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.featureFlag.create).not.toHaveBeenCalled();
    });

    it('saves the flag scoped to the project when the project exists', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({
        id: 'project-1',
        name: 'X',
        apiKeyHash: 'hash',
      });
      prisma.featureFlag.create.mockResolvedValueOnce({
        id: 'flag-1',
        projectId: 'project-1',
        key: 'new-flag',
        enabled: false,
        rolloutPercent: 0,
      });

      const result = await service.create('project-1', { key: 'new-flag' });

      expect(prisma.featureFlag.create.mock.calls[0][0].data.projectId).toEqual(
        'project-1',
      );
      expect(result.id).toEqual('flag-1');
    });
  });

  describe('findAll', () => {
    it('throws NotFoundException when project does not exist', async () => {
      prisma.project.findUnique.mockResolvedValueOnce(null);
      await expect(service.findAll('missing-project')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when flag does not exist in that project', async () => {
      prisma.featureFlag.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when flag does not exist in that project', async () => {
      prisma.featureFlag.updateManyAndReturn.mockResolvedValueOnce([]);
      await expect(
        service.update('project-1', 'missing-id', { enabled: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('merges the dto onto the existing flag and saves it', async () => {
      prisma.featureFlag.updateManyAndReturn.mockResolvedValueOnce([
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
      prisma.featureFlag.deleteMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.remove('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
      prisma.featureFlag.deleteMany.mockResolvedValueOnce({ count: 1 });
      await expect(
        service.remove('project-1', 'flag-1'),
      ).resolves.toBeUndefined();
    });
  });
});
