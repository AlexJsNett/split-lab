import { Test } from '@nestjs/testing';
import { DRIZZLE } from '@/db/drizzle.module';
import { ManageExperimentsService } from '@/features/manage-experiments/manage-experiments.service';
import { GetResultsService } from './get-results.service';

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

function mockSelectVariants(db: MockDb, resolvedRows: unknown[]) {
  db.select.mockReturnValueOnce({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(resolvedRows),
    }),
  });
}

function mockSelectCounts(db: MockDb, resolvedRows: unknown[]) {
  db.select.mockReturnValueOnce({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        groupBy: jest.fn().mockResolvedValue(resolvedRows),
      }),
    }),
  });
}

describe('GetResultsService', () => {
  let service: GetResultsService;
  let db: MockDb;
  let manageExperimentsService: { findOne: jest.Mock };

  beforeEach(async () => {
    db = createMockDb();
    manageExperimentsService = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetResultsService,
        { provide: DRIZZLE, useValue: db },
        {
          provide: ManageExperimentsService,
          useValue: manageExperimentsService,
        },
      ],
    }).compile();

    service = module.get(GetResultsService);
  });

  it('propagates the error when the experiment does not exist', async () => {
    manageExperimentsService.findOne.mockRejectedValue(
      new Error('Experiment experiment-1 not found in project project-1'),
    );

    await expect(
      service.getResults('project-1', 'experiment-1'),
    ).rejects.toThrow('not found');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns exposures, conversions and conversionRate per variant', async () => {
    manageExperimentsService.findOne.mockResolvedValue({
      id: 'experiment-1',
      projectId: 'project-1',
      flagId: null,
      name: 'X',
      status: 'running',
    });
    mockSelectVariants(db, [
      {
        id: 'variant-a',
        experimentId: 'experiment-1',
        key: 'control',
        weight: 50,
      },
      {
        id: 'variant-b',
        experimentId: 'experiment-1',
        key: 'treatment',
        weight: 50,
      },
    ]);
    mockSelectCounts(db, [
      { variantId: 'variant-a', type: 'exposure', count: 100 },
      { variantId: 'variant-a', type: 'conversion', count: 12 },
      { variantId: 'variant-b', type: 'exposure', count: 100 },
      { variantId: 'variant-b', type: 'conversion', count: 20 },
    ]);

    const result = await service.getResults('project-1', 'experiment-1');

    expect(result).toEqual([
      {
        variantId: 'variant-a',
        key: 'control',
        exposures: 100,
        conversions: 12,
        conversionRate: 0.12,
      },
      {
        variantId: 'variant-b',
        key: 'treatment',
        exposures: 100,
        conversions: 20,
        conversionRate: 0.2,
      },
    ]);
  });

  it('reports zeroes for a variant with no events instead of dropping it', async () => {
    manageExperimentsService.findOne.mockResolvedValue({
      id: 'experiment-1',
      projectId: 'project-1',
      flagId: null,
      name: 'X',
      status: 'running',
    });
    mockSelectVariants(db, [
      {
        id: 'variant-c',
        experimentId: 'experiment-1',
        key: 'holdout',
        weight: 0,
      },
    ]);
    mockSelectCounts(db, []);

    const result = await service.getResults('project-1', 'experiment-1');

    expect(result).toEqual([
      {
        variantId: 'variant-c',
        key: 'holdout',
        exposures: 0,
        conversions: 0,
        conversionRate: 0,
      },
    ]);
  });

  it('handles an exposure with no matching conversion yet', async () => {
    manageExperimentsService.findOne.mockResolvedValue({
      id: 'experiment-1',
      projectId: 'project-1',
      flagId: null,
      name: 'X',
      status: 'running',
    });
    mockSelectVariants(db, [
      {
        id: 'variant-a',
        experimentId: 'experiment-1',
        key: 'control',
        weight: 100,
      },
    ]);
    mockSelectCounts(db, [
      { variantId: 'variant-a', type: 'exposure', count: 5 },
    ]);

    const result = await service.getResults('project-1', 'experiment-1');

    expect(result).toEqual([
      {
        variantId: 'variant-a',
        key: 'control',
        exposures: 5,
        conversions: 0,
        conversionRate: 0,
      },
    ]);
  });
});
