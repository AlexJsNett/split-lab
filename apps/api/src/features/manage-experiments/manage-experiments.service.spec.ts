import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ManageExperimentsService } from './manage-experiments.service';
import { ExperimentEntity } from '@/entities/experiment/infrastructure/experiment.entity';
import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';
import { VariantEntity } from '@/entities/variant/infrastructure/variant.entity';

type MockExperimentRepository = {
  create: jest.Mock<Partial<ExperimentEntity>, [Partial<ExperimentEntity>]>;
  save: jest.Mock<Promise<ExperimentEntity>, [Partial<ExperimentEntity>]>;
  find: jest.Mock<
    Promise<ExperimentEntity[]>,
    [{ where: { projectId: string } }]
  >;
  findOneBy: jest.Mock<
    Promise<ExperimentEntity | null>,
    [{ id: string; projectId: string }]
  >;
  delete: jest.Mock<
    Promise<{ affected: number }>,
    [{ id: string; projectId: string }]
  >;
};

type MockProjectRepository = {
  findOneBy: jest.Mock<Promise<ProjectEntity | null>, [{ id: string }]>;
};

type MockVariantRepository = {
  find: jest.Mock<
    Promise<VariantEntity[]>,
    [{ where: { experimentId: string } }]
  >;
};

describe('ManageExperimentsService', () => {
  let service: ManageExperimentsService;
  let experimentRepository: MockExperimentRepository;
  let projectRepository: MockProjectRepository;
  let variantRepository: MockVariantRepository;

  beforeEach(async () => {
    experimentRepository = {
      create: jest.fn() as MockExperimentRepository['create'],
      save: jest.fn() as MockExperimentRepository['save'],
      find: jest.fn() as MockExperimentRepository['find'],
      findOneBy: jest.fn() as MockExperimentRepository['findOneBy'],
      delete: jest.fn() as MockExperimentRepository['delete'],
    };
    projectRepository = {
      findOneBy: jest.fn() as MockProjectRepository['findOneBy'],
    };
    variantRepository = {
      find: jest.fn() as MockVariantRepository['find'],
    };

    const module = await Test.createTestingModule({
      providers: [
        ManageExperimentsService,
        {
          provide: getRepositoryToken(ExperimentEntity),
          useValue: experimentRepository,
        },
        {
          provide: getRepositoryToken(ProjectEntity),
          useValue: projectRepository,
        },
        {
          provide: getRepositoryToken(VariantEntity),
          useValue: variantRepository,
        },
      ],
    }).compile();

    service = module.get(ManageExperimentsService);
  });

  describe('create', () => {
    it('throws NotFoundException when project does not exist', async () => {
      projectRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.create('missing-project', { name: 'Checkout test' }),
      ).rejects.toThrow(NotFoundException);
      expect(experimentRepository.save).not.toHaveBeenCalled();
    });

    it('saves the experiment scoped to the project when it exists', async () => {
      projectRepository.findOneBy.mockResolvedValue({
        id: 'project-1',
        name: 'X',
        apiKeyHash: 'hash',
      });
      experimentRepository.create.mockImplementation((data) => data);
      experimentRepository.save.mockImplementation((entity) =>
        Promise.resolve({
          id: 'experiment-1',
          ...entity,
        } as ExperimentEntity),
      );

      const result = await service.create('project-1', {
        name: 'Checkout test',
      });

      const savedArg = experimentRepository.save.mock.calls[0][0];
      expect(savedArg.projectId).toEqual('project-1');
      expect(result.id).toEqual('experiment-1');
    });
  });

  describe('findAll', () => {
    it('throws NotFoundException when project does not exist', async () => {
      projectRepository.findOneBy.mockResolvedValue(null);
      await expect(service.findAll('missing-project')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when experiment does not exist in that project', async () => {
      experimentRepository.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when experiment does not exist in that project', async () => {
      experimentRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.update('project-1', 'missing-id', { name: 'New name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates fields that are not status without touching variants', async () => {
      const existing: ExperimentEntity = {
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'Old name',
        status: 'draft',
      } as ExperimentEntity;
      experimentRepository.findOneBy.mockResolvedValue(existing);
      experimentRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as ExperimentEntity),
      );

      const result = await service.update('project-1', 'experiment-1', {
        name: 'New name',
      });

      expect(variantRepository.find).not.toHaveBeenCalled();
      expect(result.name).toEqual('New name');
      expect(result.status).toEqual('draft');
    });

    it('throws BadRequestException when moving to running and weights do not sum to 100', async () => {
      const existing: ExperimentEntity = {
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'X',
        status: 'draft',
      } as ExperimentEntity;
      experimentRepository.findOneBy.mockResolvedValue(existing);
      variantRepository.find.mockResolvedValue([
        { id: 'v1', experimentId: 'experiment-1', key: 'control', weight: 50 },
      ] as VariantEntity[]);

      await expect(
        service.update('project-1', 'experiment-1', { status: 'running' }),
      ).rejects.toThrow(BadRequestException);
      expect(experimentRepository.save).not.toHaveBeenCalled();
    });

    it('moves to running when weights sum to exactly 100', async () => {
      const existing: ExperimentEntity = {
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'X',
        status: 'draft',
      } as ExperimentEntity;
      experimentRepository.findOneBy.mockResolvedValue(existing);
      variantRepository.find.mockResolvedValue([
        { id: 'v1', experimentId: 'experiment-1', key: 'control', weight: 50 },
        {
          id: 'v2',
          experimentId: 'experiment-1',
          key: 'treatment',
          weight: 50,
        },
      ] as VariantEntity[]);
      experimentRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as ExperimentEntity),
      );

      const result = await service.update('project-1', 'experiment-1', {
        status: 'running',
      });

      expect(result.status).toEqual('running');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      experimentRepository.delete.mockResolvedValue({ affected: 0 });
      await expect(service.remove('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
      experimentRepository.delete.mockResolvedValue({ affected: 1 });
      await expect(
        service.remove('project-1', 'experiment-1'),
      ).resolves.toBeUndefined();
    });
  });
});
