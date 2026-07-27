import { Test } from '@nestjs/testing';
import { ManageProjectsService } from './manage-projects.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';
import { NotFoundException } from '@nestjs/common';

function createMockRepository() {
  return {
    create: jest.fn<Partial<ProjectEntity>, [Partial<ProjectEntity>]>(),
    save: jest.fn<Promise<ProjectEntity>, [Partial<ProjectEntity>]>(),
    find: jest.fn<Promise<ProjectEntity[]>, []>(),
    findOneBy: jest.fn<Promise<ProjectEntity | null>, [{ id: string }]>(),
    preload: jest.fn<
      Promise<ProjectEntity | undefined>,
      [Partial<ProjectEntity> & { id: string }]
    >(),
    delete: jest.fn<Promise<{ affected: number }>, [{ id: string }]>(),
  };
}

describe('ManageProjectsService', () => {
  let service: ManageProjectsService;

  let repository: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    repository = createMockRepository();

    const module = await Test.createTestingModule({
      providers: [
        ManageProjectsService,
        {
          provide: getRepositoryToken(ProjectEntity),
          useValue: repository,
        },
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

      const savedArg = repository.save.mock.calls[0][0] as {
        apiKeyHash: string;
      };
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
