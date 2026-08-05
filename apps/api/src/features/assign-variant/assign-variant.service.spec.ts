import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DRIZZLE } from '@/db/drizzle.module';
import { ManageExperimentsService } from '@/features/manage-experiments/manage-experiments.service';
import { AssignVariantService } from './assign-variant.service';

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

function mockSelectWhere(db: MockDb, resolvedRows: unknown[]) {
  db.select.mockReturnValueOnce({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(resolvedRows),
    }),
  });
}

function mockInsert(db: MockDb) {
  const valuesFn = jest.fn().mockResolvedValue(undefined);
  db.insert.mockReturnValueOnce({ values: valuesFn });
  return valuesFn;
}

describe('AssignVariantService', () => {
  let service: AssignVariantService;
  let db: MockDb;
  let manageExperimentsService: { findOne: jest.Mock };

  beforeEach(async () => {
    db = createMockDb();
    manageExperimentsService = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AssignVariantService,
        { provide: DRIZZLE, useValue: db },
        {
          provide: ManageExperimentsService,
          useValue: manageExperimentsService,
        },
      ],
    }).compile();

    service = module.get(AssignVariantService);
  });

  it('throws BadRequestException when the experiment is not running', async () => {
    manageExperimentsService.findOne.mockResolvedValue({
      id: 'experiment-1',
      projectId: 'project-1',
      flagId: null,
      name: 'X',
      status: 'draft',
    });

    await expect(
      service.assign('project-1', 'experiment-1', 'user-42'),
    ).rejects.toThrow(BadRequestException);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('propagates NotFoundException when the experiment does not exist', async () => {
    manageExperimentsService.findOne.mockRejectedValue(
      new Error('Experiment experiment-1 not found in project project-1'),
    );

    await expect(
      service.assign('project-1', 'experiment-1', 'user-42'),
    ).rejects.toThrow('not found');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('assigns a variant and logs an exposure event when the experiment is running', async () => {
    manageExperimentsService.findOne.mockResolvedValue({
      id: 'experiment-1',
      projectId: 'project-1',
      flagId: null,
      name: 'X',
      status: 'running',
    });
    mockSelectWhere(db, [
      {
        id: 'variant-1',
        experimentId: 'experiment-1',
        key: 'control',
        weight: 100,
      },
    ]);
    const valuesFn = mockInsert(db);

    const result = await service.assign('project-1', 'experiment-1', 'user-42');

    expect(result).toEqual({
      id: 'variant-1',
      experimentId: 'experiment-1',
      key: 'control',
      weight: 100,
    });
    expect(valuesFn).toHaveBeenCalledWith({
      experimentId: 'experiment-1',
      variantId: 'variant-1',
      userId: 'user-42',
      type: 'exposure',
    });
  });

  it('is deterministic — same experiment and userId always resolve to the same variant', async () => {
    manageExperimentsService.findOne.mockResolvedValue({
      id: 'experiment-1',
      projectId: 'project-1',
      flagId: null,
      name: 'X',
      status: 'running',
    });
    const rows = [
      { id: 'variant-a', experimentId: 'experiment-1', key: 'a', weight: 50 },
      { id: 'variant-b', experimentId: 'experiment-1', key: 'b', weight: 50 },
    ];
    mockSelectWhere(db, rows);
    mockInsert(db);
    const first = await service.assign('project-1', 'experiment-1', 'user-42');

    mockSelectWhere(db, rows);
    mockInsert(db);
    const second = await service.assign('project-1', 'experiment-1', 'user-42');

    expect(second.id).toEqual(first.id);
  });
});
