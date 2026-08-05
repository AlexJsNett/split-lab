import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DRIZZLE } from '@/db/drizzle.module';
import { ManageExperimentsService } from '@/features/manage-experiments/manage-experiments.service';
import { LogConversionService } from './log-conversion.service';

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

function mockInsert(db: MockDb, resolvedRows: unknown[]) {
  const valuesFn = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue(resolvedRows),
  });
  db.insert.mockReturnValueOnce({ values: valuesFn });
  return valuesFn;
}

describe('LogConversionService', () => {
  let service: LogConversionService;
  let db: MockDb;
  let manageExperimentsService: { findOne: jest.Mock };

  beforeEach(async () => {
    db = createMockDb();
    manageExperimentsService = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        LogConversionService,
        { provide: DRIZZLE, useValue: db },
        {
          provide: ManageExperimentsService,
          useValue: manageExperimentsService,
        },
      ],
    }).compile();

    service = module.get(LogConversionService);
  });

  it('propagates the error when the experiment does not exist', async () => {
    manageExperimentsService.findOne.mockRejectedValue(
      new Error('Experiment experiment-1 not found in project project-1'),
    );

    await expect(
      service.logConversion('project-1', 'experiment-1', 'user-42'),
    ).rejects.toThrow('not found');
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when there is no prior exposure for this user', async () => {
    manageExperimentsService.findOne.mockResolvedValue({
      id: 'experiment-1',
      projectId: 'project-1',
      flagId: null,
      name: 'X',
      status: 'running',
    });
    mockSelectWhere(db, []);

    await expect(
      service.logConversion('project-1', 'experiment-1', 'user-42'),
    ).rejects.toThrow(BadRequestException);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('logs a conversion event reusing the variantId from the prior exposure', async () => {
    manageExperimentsService.findOne.mockResolvedValue({
      id: 'experiment-1',
      projectId: 'project-1',
      flagId: null,
      name: 'X',
      status: 'running',
    });
    mockSelectWhere(db, [
      {
        id: 'event-1',
        experimentId: 'experiment-1',
        variantId: 'variant-1',
        userId: 'user-42',
        type: 'exposure',
        createdAt: new Date(),
      },
    ]);
    const valuesFn = mockInsert(db, [
      {
        id: 'event-2',
        experimentId: 'experiment-1',
        variantId: 'variant-1',
        userId: 'user-42',
        type: 'conversion',
        createdAt: new Date(),
      },
    ]);

    const result = await service.logConversion(
      'project-1',
      'experiment-1',
      'user-42',
    );

    expect(valuesFn).toHaveBeenCalledWith({
      experimentId: 'experiment-1',
      variantId: 'variant-1',
      userId: 'user-42',
      type: 'conversion',
    });
    expect(result.type).toEqual('conversion');
    expect(result.variantId).toEqual('variant-1');
  });

  it('accepts a conversion after the experiment stopped running (no status check)', async () => {
    manageExperimentsService.findOne.mockResolvedValue({
      id: 'experiment-1',
      projectId: 'project-1',
      flagId: null,
      name: 'X',
      status: 'completed',
    });
    mockSelectWhere(db, [
      {
        id: 'event-1',
        experimentId: 'experiment-1',
        variantId: 'variant-1',
        userId: 'user-42',
        type: 'exposure',
        createdAt: new Date(),
      },
    ]);
    mockInsert(db, [
      {
        id: 'event-2',
        experimentId: 'experiment-1',
        variantId: 'variant-1',
        userId: 'user-42',
        type: 'conversion',
        createdAt: new Date(),
      },
    ]);

    await expect(
      service.logConversion('project-1', 'experiment-1', 'user-42'),
    ).resolves.toMatchObject({ type: 'conversion' });
  });
});
