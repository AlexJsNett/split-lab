import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ManageProjectsService } from './manage-projects.service';
import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';

type MockProjectRepository = {
  create: jest.Mock<Partial<ProjectEntity>, [Partial<ProjectEntity>]>;
  save: jest.Mock<Promise<ProjectEntity>, [Partial<ProjectEntity>]>;
  find: jest.Mock<Promise<ProjectEntity[]>, []>;
  findOneBy: jest.Mock<Promise<ProjectEntity | null>, [{ id: string }]>;
  preload: jest.Mock<
    Promise<ProjectEntity | undefined>,
    [Partial<ProjectEntity> & { id: string }]
  >;
  delete: jest.Mock<Promise<{ affected: number }>, [{ id: string }]>;
};

describe('ManageProjectsService', () => {
  let service: ManageProjectsService;
  let repository: MockProjectRepository;

  beforeEach(async () => {
    repository = {
      create: jest.fn() as MockProjectRepository['create'],
      save: jest.fn() as MockProjectRepository['save'],
      find: jest.fn() as MockProjectRepository['find'],
      findOneBy: jest.fn() as MockProjectRepository['findOneBy'],
      preload: jest.fn() as MockProjectRepository['preload'],
      delete: jest.fn() as MockProjectRepository['delete'],
    };

    const module = await Test.createTestingModule({
      providers: [
        ManageProjectsService,
        { provide: getRepositoryToken(ProjectEntity), useValue: repository },
      ],
    }).compile();

    service = module.get(ManageProjectsService);
  });

  describe('create', () => {
    it('saves a hash, not the raw key, and returns the raw key exactly once', async () => {
      repository.create.mockImplementation((data) => data);
      repository.save.mockImplementation(
        (entity) =>
          Promise.resolve({
            id: 'uuid-1',
            ...entity,
          }) as Promise<ProjectEntity>,
      );

      const result = await service.create({ name: 'Test' });

      const savedArg = repository.save.mock.calls[0][0];
      expect(savedArg.apiKeyHash).toEqual(expect.any(String));
      expect(savedArg.apiKeyHash).not.toEqual(result.apiKey);
      expect(result).not.toHaveProperty('apiKeyHash');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when project does not exist', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('never returns apiKeyHash when found', async () => {
      repository.findOneBy.mockResolvedValue({
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
      repository.preload.mockResolvedValue(undefined);
      await expect(
        service.update('missing-id', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      repository.delete.mockResolvedValue({ affected: 0 });
      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves when a row was deleted', async () => {
      repository.delete.mockResolvedValue({ affected: 1 });
      await expect(service.remove('1')).resolves.toBeUndefined();
    });
  });
});
