import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ManageFlagsService } from './manage-flags.service';
import { FeatureFlagEntity } from '@/entities/feature-flag/infrastructure/feature-flag.entity';
import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';

type MockFlagRepository = {
  create: jest.Mock<Partial<FeatureFlagEntity>, [Partial<FeatureFlagEntity>]>;
  save: jest.Mock<
    Promise<Partial<FeatureFlagEntity>>,
    [Partial<FeatureFlagEntity>]
  >;
  find: jest.Mock<
    Promise<FeatureFlagEntity[]>,
    [{ where: { projectId: string } }]
  >;
  findOneBy: jest.Mock<
    Promise<FeatureFlagEntity | null>,
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

describe('ManageFlagsService', () => {
  let service: ManageFlagsService;
  let flagRepository: MockFlagRepository;
  let projectRepository: MockProjectRepository;

  beforeEach(async () => {
    flagRepository = {
      create: jest.fn() as MockFlagRepository['create'],
      save: jest.fn() as MockFlagRepository['save'],
      find: jest.fn() as MockFlagRepository['find'],
      findOneBy: jest.fn() as MockFlagRepository['findOneBy'],
      delete: jest.fn() as MockFlagRepository['delete'],
    };
    projectRepository = {
      findOneBy: jest.fn() as MockProjectRepository['findOneBy'],
    };

    const module = await Test.createTestingModule({
      providers: [
        ManageFlagsService,
        {
          provide: getRepositoryToken(FeatureFlagEntity),
          useValue: flagRepository,
        },
        {
          provide: getRepositoryToken(ProjectEntity),
          useValue: projectRepository,
        },
      ],
    }).compile();

    service = module.get(ManageFlagsService);
  });

  describe('create', () => {
    it('throws NotFoundException when project does not exist', async () => {
      projectRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.create('missing-project', { key: 'new-flag' }),
      ).rejects.toThrow(NotFoundException);
      expect(flagRepository.save).not.toHaveBeenCalled();
    });

    it('saves the flag scoped to the project when the project exists', async () => {
      projectRepository.findOneBy.mockResolvedValue({
        id: 'project-1',
        name: 'X',
        apiKeyHash: 'hash',
      });
      flagRepository.create.mockImplementation((data) => data);
      flagRepository.save.mockImplementation((entity) =>
        Promise.resolve({ id: 'flag-1', ...entity }),
      );

      const result = await service.create('project-1', { key: 'new-flag' });

      const savedArg = flagRepository.save.mock.calls[0][0];
      expect(savedArg.projectId).toEqual('project-1');
      expect(result.id).toEqual('flag-1');
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
    it('throws NotFoundException when flag does not exist in that project', async () => {
      flagRepository.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when flag does not exist in that project', async () => {
      flagRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.update('project-1', 'missing-id', { enabled: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('merges the dto onto the existing flag and saves it', async () => {
      const existing: FeatureFlagEntity = {
        id: 'flag-1',
        projectId: 'project-1',
        key: 'old-key',
        enabled: false,
        rolloutPercent: 0,
      } as FeatureFlagEntity;
      flagRepository.findOneBy.mockResolvedValue(existing);
      flagRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as FeatureFlagEntity),
      );

      const result = await service.update('project-1', 'flag-1', {
        enabled: true,
      });

      expect(result.enabled).toBe(true);
      expect(result.key).toEqual('old-key');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      flagRepository.delete.mockResolvedValue({ affected: 0 });
      await expect(service.remove('project-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
      flagRepository.delete.mockResolvedValue({ affected: 1 });
      await expect(
        service.remove('project-1', 'flag-1'),
      ).resolves.toBeUndefined();
    });
  });
});
