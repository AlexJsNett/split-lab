import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
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

describe('LogConversionService', () => {
  let service: LogConversionService;
  let db: MockDb;
  let manageExperimentsService: { findOne: jest.Mock };
  let client: { emit: jest.Mock };

  beforeEach(async () => {
    db = createMockDb();
    manageExperimentsService = { findOne: jest.fn() };
    client = { emit: jest.fn().mockReturnValue(of(undefined)) };

    const module = await Test.createTestingModule({
      providers: [
        LogConversionService,
        { provide: DRIZZLE, useValue: db },
        {
          provide: ManageExperimentsService,
          useValue: manageExperimentsService,
        },
        { provide: 'EVENTS_CLIENT', useValue: client },
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
    expect(client.emit).not.toHaveBeenCalled();
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

    const result = await service.logConversion(
      'project-1',
      'experiment-1',
      'user-42',
    );

    expect(client.emit).toHaveBeenCalledWith('conversion', {
      experimentId: 'experiment-1',
      variantId: 'variant-1',
      userId: 'user-42',
      type: 'conversion',
    });
    expect(result.type).toEqual('conversion');
    expect(result.variantId).toEqual('variant-1');
    expect(db.select).toHaveBeenCalledTimes(1);
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

    await expect(
      service.logConversion('project-1', 'experiment-1', 'user-42'),
    ).resolves.toMatchObject({ type: 'conversion' });
  });

  describe('bounded retry for the exposure lookup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('retries and succeeds once the exposure shows up on a later attempt', async () => {
      manageExperimentsService.findOne.mockResolvedValue({
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'X',
        status: 'running',
      });
      // not found on the first attempt (worker hasn't written it yet), found on the second
      mockSelectWhere(db, []);
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

      const resultPromise = service.logConversion(
        'project-1',
        'experiment-1',
        'user-42',
      );

      // first attempt already ran synchronously (before the first await on setTimeout);
      // advance past the 25ms delay to unblock the second attempt.
      await jest.advanceTimersByTimeAsync(25);

      const result = await resultPromise;

      expect(db.select).toHaveBeenCalledTimes(2);
      expect(client.emit).toHaveBeenCalledWith('conversion', {
        experimentId: 'experiment-1',
        variantId: 'variant-1',
        userId: 'user-42',
        type: 'conversion',
      });
      expect(result.variantId).toEqual('variant-1');
    });

    it('throws BadRequestException after exhausting all 5 attempts', async () => {
      manageExperimentsService.findOne.mockResolvedValue({
        id: 'experiment-1',
        projectId: 'project-1',
        flagId: null,
        name: 'X',
        status: 'running',
      });
      mockSelectWhere(db, []);
      mockSelectWhere(db, []);
      mockSelectWhere(db, []);
      mockSelectWhere(db, []);
      mockSelectWhere(db, []);

      const resultPromise = service.logConversion(
        'project-1',
        'experiment-1',
        'user-42',
      );
      // swallow the rejection early so Node doesn't flag an unhandled rejection
      // while we're still advancing timers below.
      const assertion =
        expect(resultPromise).rejects.toThrow(BadRequestException);

      // D9 (M10 plan): EXPOSURE_RETRY_DELAYS_MS widened to [25, 50, 100, 200] —
      // one rung wider than M9's [25, 50, 100], since the write now crosses a
      // process boundary and a broker hop, not just an in-memory queue round-trip.
      await jest.advanceTimersByTimeAsync(25);
      await jest.advanceTimersByTimeAsync(50);
      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(200);

      await assertion;
      expect(db.select).toHaveBeenCalledTimes(5);
      expect(client.emit).not.toHaveBeenCalled();
    });
  });
});
