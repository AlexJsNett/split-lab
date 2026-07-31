import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/db/prisma.service';
import { ManageExperimentsService } from './manage-experiments.service';

type MockPrisma = {
  project: {
    findUnique: jest.Mock;
  };
  experiment: {
    create: jest.Mock<
      Promise<unknown>,
      [{ data: { projectId: string; name: string } }]
    >;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateManyAndReturn: jest.Mock;
    deleteMany: jest.Mock;
  };
  variant: {
    findMany: jest.Mock;
  };
};

function createMockPrisma(): MockPrisma {
  return {
    project: {
      findUnique: jest.fn(),
    },
    experiment: {
      create: jest.fn<
        Promise<unknown>,
        [{ data: { projectId: string; name: string } }]
      >(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateManyAndReturn: jest.fn(),
      deleteMany: jest.fn(),
    },
    variant: {
      findMany: jest.fn(),
    },
  };
}

describe('ManageExperimentsService', () => {
  let service: ManageExperimentsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ManageExperimentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ManageExperimentsService);
  });

  describe('create', () => {
    it('throws NotFoundException when project does not exist', async () => {
      prisma.project.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.create('missing-project', { name: 'Checkout test' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.experiment.create).not.toHaveBeenCalled();
    });

    it('saves the experiment scoped to the project when it exists', async () => {
      prisma.project.findUnique.mockResolvedValueOnce({
        id: 'project-1',
        name: 'X',
        apiKeyHash: 'hash',
      });
      prisma.experiment.create.mockResolvedValueOnce({
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'Checkout test',
        status: 'draft',
      });

      const result = await service.create('project-1', {
        name: 'Checkout test',
      });

      expect(prisma.experiment.create.mock.calls[0][0].data.projectId).toEqual(
        'project-1',
      );
      expect(result.id).toEqual('experiment-1');
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
    it('throws NotFoundException when experiment does not exist in that project', async () => {
      prisma.experiment.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when experiment does not exist in that project', async () => {
      prisma.experiment.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.update('project-1', 'missing-id', { name: 'New name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates fields that are not status without touching variants', async () => {
      prisma.experiment.findFirst.mockResolvedValueOnce({
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'Old name',
        status: 'draft',
      });
      prisma.experiment.updateManyAndReturn.mockResolvedValueOnce([
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

      expect(prisma.experiment.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.variant.findMany).not.toHaveBeenCalled();
      expect(result.name).toEqual('New name');
      expect(result.status).toEqual('draft');
    });

    it('throws BadRequestException when moving to running and weights do not sum to 100', async () => {
      prisma.experiment.findFirst.mockResolvedValueOnce({
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'X',
        status: 'draft',
      });
      prisma.variant.findMany.mockResolvedValueOnce([
        { id: 'v1', experimentId: 'experiment-1', key: 'control', weight: 50 },
      ]);

      await expect(
        service.update('project-1', 'experiment-1', { status: 'running' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.experiment.updateManyAndReturn).not.toHaveBeenCalled();
    });

    it('moves to running when weights sum to exactly 100', async () => {
      prisma.experiment.findFirst.mockResolvedValueOnce({
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'X',
        status: 'draft',
      });
      prisma.variant.findMany.mockResolvedValueOnce([
        { id: 'v1', experimentId: 'experiment-1', key: 'control', weight: 50 },
        {
          id: 'v2',
          experimentId: 'experiment-1',
          key: 'treatment',
          weight: 50,
        },
      ]);
      prisma.experiment.updateManyAndReturn.mockResolvedValueOnce([
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
      prisma.experiment.deleteMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.remove('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
      prisma.experiment.deleteMany.mockResolvedValueOnce({ count: 1 });
      await expect(
        service.remove('project-1', 'experiment-1'),
      ).resolves.toBeUndefined();
    });
  });
});
