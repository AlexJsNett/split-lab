import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ManageVariantsService } from './manage-variants.service';
import { VariantEntity } from '@/entities/variant/infrastructure/variant.entity';
import { ExperimentEntity } from '@/entities/experiment/infrastructure/experiment.entity';

type MockVariantRepository = {
  create: jest.Mock<Partial<VariantEntity>, [Partial<VariantEntity>]>;
  save: jest.Mock<Promise<VariantEntity>, [Partial<VariantEntity>]>;
  find: jest.Mock<
    Promise<VariantEntity[]>,
    [{ where: { experimentId: string } }]
  >;
  findOneBy: jest.Mock<
    Promise<VariantEntity | null>,
    [{ id: string; experimentId: string }]
  >;
  delete: jest.Mock<
    Promise<{ affected: number }>,
    [{ id: string; experimentId: string }]
  >;
};

type MockExperimentRepository = {
  findOneBy: jest.Mock<Promise<ExperimentEntity | null>, [{ id: string }]>;
};

describe('ManageVariantsService', () => {
  let service: ManageVariantsService;
  let variantRepository: MockVariantRepository;
  let experimentRepository: MockExperimentRepository;

  beforeEach(async () => {
    variantRepository = {
      create: jest.fn() as MockVariantRepository['create'],
      save: jest.fn() as MockVariantRepository['save'],
      find: jest.fn() as MockVariantRepository['find'],
      findOneBy: jest.fn() as MockVariantRepository['findOneBy'],
      delete: jest.fn() as MockVariantRepository['delete'],
    };
    experimentRepository = {
      findOneBy: jest.fn() as MockExperimentRepository['findOneBy'],
    };

    const module = await Test.createTestingModule({
      providers: [
        ManageVariantsService,
        {
          provide: getRepositoryToken(VariantEntity),
          useValue: variantRepository,
        },
        {
          provide: getRepositoryToken(ExperimentEntity),
          useValue: experimentRepository,
        },
      ],
    }).compile();

    service = module.get(ManageVariantsService);
  });

  describe('create', () => {
    it('throws NotFoundException when experiment does not exist', async () => {
      experimentRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.create('missing-experiment', { key: 'control', weight: 50 }),
      ).rejects.toThrow(NotFoundException);
      expect(variantRepository.save).not.toHaveBeenCalled();
    });

    it('saves the variant scoped to the experiment when it exists', async () => {
      experimentRepository.findOneBy.mockResolvedValue({
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'X',
        status: 'draft',
      } as ExperimentEntity);
      variantRepository.create.mockImplementation((data) => data);
      variantRepository.save.mockImplementation((entity) =>
        Promise.resolve({ id: 'variant-1', ...entity } as VariantEntity),
      );

      const result = await service.create('experiment-1', {
        key: 'control',
        weight: 50,
      });

      const savedArg = variantRepository.save.mock.calls[0][0];
      expect(savedArg.experimentId).toEqual('experiment-1');
      expect(result.id).toEqual('variant-1');
    });
  });

  describe('findAll', () => {
    it('throws NotFoundException when experiment does not exist', async () => {
      experimentRepository.findOneBy.mockResolvedValue(null);
      await expect(service.findAll('missing-experiment')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when variant does not exist in that experiment', async () => {
      variantRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.findOne('experiment-1', 'missing-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when variant does not exist in that experiment', async () => {
      variantRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.update('experiment-1', 'missing-id', { weight: 60 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('merges the dto onto the existing variant and saves it', async () => {
      const existing: VariantEntity = {
        id: 'variant-1',
        experimentId: 'experiment-1',
        key: 'control',
        weight: 50,
      } as VariantEntity;
      variantRepository.findOneBy.mockResolvedValue(existing);
      variantRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as VariantEntity),
      );

      const result = await service.update('experiment-1', 'variant-1', {
        weight: 60,
      });

      expect(result.weight).toBe(60);
      expect(result.key).toEqual('control');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      variantRepository.delete.mockResolvedValue({ affected: 0 });
      await expect(
        service.remove('experiment-1', 'missing-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('resolves when a row was deleted', async () => {
      variantRepository.delete.mockResolvedValue({ affected: 1 });
      await expect(
        service.remove('experiment-1', 'variant-1'),
      ).resolves.toBeUndefined();
    });
  });
});
