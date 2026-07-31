import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/db/prisma.service';
import { ManageVariantsService } from './manage-variants.service';

type MockPrisma = {
  experiment: {
    findUnique: jest.Mock;
  };
  variant: {
    create: jest.Mock<
      Promise<unknown>,
      [{ data: { experimentId: string; key: string; weight: number } }]
    >;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateManyAndReturn: jest.Mock;
    deleteMany: jest.Mock;
  };
};

function createMockPrisma(): MockPrisma {
  return {
    experiment: {
      findUnique: jest.fn(),
    },
    variant: {
      create: jest.fn<
        Promise<unknown>,
        [{ data: { experimentId: string; key: string; weight: number } }]
      >(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateManyAndReturn: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

describe('ManageVariantsService', () => {
  let service: ManageVariantsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ManageVariantsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ManageVariantsService);
  });

  describe('create', () => {
    it('throws NotFoundException when experiment does not exist', async () => {
      prisma.experiment.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.create('missing-experiment', { key: 'control', weight: 50 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.variant.create).not.toHaveBeenCalled();
    });

    it('saves the variant scoped to the experiment when it exists', async () => {
      prisma.experiment.findUnique.mockResolvedValueOnce({
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'X',
        status: 'draft',
      });
      prisma.variant.create.mockResolvedValueOnce({
        id: 'variant-1',
        experimentId: 'experiment-1',
        key: 'control',
        weight: 50,
      });

      const result = await service.create('experiment-1', {
        key: 'control',
        weight: 50,
      });

      expect(prisma.variant.create.mock.calls[0][0].data.experimentId).toEqual(
        'experiment-1',
      );
      expect(result.id).toEqual('variant-1');
    });
  });

  describe('findAll', () => {
    it('throws NotFoundException when experiment does not exist', async () => {
      prisma.experiment.findUnique.mockResolvedValueOnce(null);
      await expect(service.findAll('missing-experiment')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when variant does not exist in that experiment', async () => {
      prisma.variant.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.findOne('experiment-1', 'missing-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when variant does not exist in that experiment', async () => {
      prisma.variant.updateManyAndReturn.mockResolvedValueOnce([]);
      await expect(
        service.update('experiment-1', 'missing-id', { weight: 60 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('merges the dto onto the existing variant and saves it', async () => {
      prisma.variant.updateManyAndReturn.mockResolvedValueOnce([
        {
          id: 'variant-1',
          experimentId: 'experiment-1',
          key: 'control',
          weight: 60,
        },
      ]);

      const result = await service.update('experiment-1', 'variant-1', {
        weight: 60,
      });

      expect(result.weight).toBe(60);
      expect(result.key).toEqual('control');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      prisma.variant.deleteMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.remove('experiment-1', 'missing-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('resolves when a row was deleted', async () => {
      prisma.variant.deleteMany.mockResolvedValueOnce({ count: 1 });
      await expect(
        service.remove('experiment-1', 'variant-1'),
      ).resolves.toBeUndefined();
    });
  });
});
