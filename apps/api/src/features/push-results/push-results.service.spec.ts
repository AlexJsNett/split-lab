import { Test } from '@nestjs/testing';
import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '@/db/drizzle.module';
import { GetResultsService } from '@/features/get-results/get-results.service';
import {
  ResultsWebhookClient,
  WebhookDeliveryFailedError,
} from './results-webhook.client';
import { PushResultsService } from './push-results.service';

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

function createMockDb(): MockDb {
  return { select: jest.fn(), insert: jest.fn(), update: jest.fn() };
}

function mockInsertOnConflict(db: MockDb, resolvedRows: unknown[]) {
  const valuesFn = jest
    .fn<
      { onConflictDoNothing: jest.Mock },
      [{ experimentId: string; idempotencyKey: string }]
    >()
    .mockReturnValue({
      onConflictDoNothing: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(resolvedRows),
      }),
    });
  db.insert.mockReturnValueOnce({ values: valuesFn });
  return valuesFn;
}

function mockSelectWhere(db: MockDb, resolvedRows: unknown[]) {
  db.select.mockReturnValueOnce({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(resolvedRows),
    }),
  });
}

function mockUpdateWhere(db: MockDb) {
  const whereFn = jest.fn().mockResolvedValue(undefined);
  db.update.mockReturnValueOnce({
    set: jest.fn().mockReturnValue({ where: whereFn }),
  });
  return whereFn;
}

const VARIANT_RESULTS = [
  {
    variantId: 'variant-a',
    key: 'control',
    exposures: 100,
    conversions: 10,
    conversionRate: 0.1,
  },
  {
    variantId: 'variant-b',
    key: 'treatment',
    exposures: 100,
    conversions: 20,
    conversionRate: 0.2,
  },
];

describe('PushResultsService', () => {
  let service: PushResultsService;
  let db: MockDb;
  let getResultsService: { getResults: jest.Mock };
  let webhookClient: { send: jest.Mock };

  beforeEach(async () => {
    db = createMockDb();
    getResultsService = { getResults: jest.fn() };
    webhookClient = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PushResultsService,
        { provide: DRIZZLE, useValue: db },
        { provide: GetResultsService, useValue: getResultsService },
        { provide: ResultsWebhookClient, useValue: webhookClient },
      ],
    }).compile();

    service = module.get(PushResultsService);
  });

  it('propagates the 404 when the experiment does not exist, making no insert or HTTP call', async () => {
    getResultsService.getResults.mockRejectedValue(
      new NotFoundException('Experiment experiment-1 not found'),
    );

    await expect(
      service.pushResults('project-1', 'experiment-1'),
    ).rejects.toThrow(NotFoundException);
    expect(db.insert).not.toHaveBeenCalled();
    expect(webhookClient.send).not.toHaveBeenCalled();
  });

  it('hashes shuffled result order to the identical idempotency key', async () => {
    getResultsService.getResults.mockResolvedValueOnce([...VARIANT_RESULTS]);
    const firstValues = mockInsertOnConflict(db, [
      { id: 'delivery-1', experimentId: 'experiment-1' },
    ]);
    webhookClient.send.mockResolvedValueOnce({ status: 200, attempts: 1 });
    mockUpdateWhere(db);
    await service.pushResults('project-1', 'experiment-1');

    getResultsService.getResults.mockResolvedValueOnce(
      [...VARIANT_RESULTS].reverse(),
    );
    const secondValues = mockInsertOnConflict(db, [
      { id: 'delivery-2', experimentId: 'experiment-1' },
    ]);
    webhookClient.send.mockResolvedValueOnce({ status: 200, attempts: 1 });
    mockUpdateWhere(db);
    await service.pushResults('project-1', 'experiment-1');

    const firstKey = firstValues.mock.calls[0][0].idempotencyKey;
    const secondKey = secondValues.mock.calls[0][0].idempotencyKey;
    expect(firstKey).toEqual(secondKey);
  });

  it('inserts a pending row, sends once, and marks it delivered', async () => {
    getResultsService.getResults.mockResolvedValue(VARIANT_RESULTS);
    mockInsertOnConflict(db, [
      { id: 'delivery-1', experimentId: 'experiment-1' },
    ]);
    webhookClient.send.mockResolvedValue({ status: 200, attempts: 1 });
    const updateWhere = mockUpdateWhere(db);

    const result = await service.pushResults('project-1', 'experiment-1');

    expect(result).toEqual({
      status: 'delivered',
      responseStatus: 200,
      attempts: 1,
    });
    expect(webhookClient.send).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalled();
  });

  it('short-circuits an unchanged second push with zero HTTP calls', async () => {
    getResultsService.getResults.mockResolvedValue(VARIANT_RESULTS);
    mockInsertOnConflict(db, []); // conflict — already exists
    mockSelectWhere(db, [
      {
        id: 'delivery-1',
        experimentId: 'experiment-1',
        status: 'delivered',
      },
    ]);

    const result = await service.pushResults('project-1', 'experiment-1');

    expect(result).toEqual({ status: 'duplicate' });
    expect(webhookClient.send).not.toHaveBeenCalled();
  });

  it('re-attempts a row that previously failed', async () => {
    getResultsService.getResults.mockResolvedValue(VARIANT_RESULTS);
    mockInsertOnConflict(db, []); // conflict — already exists
    mockSelectWhere(db, [
      { id: 'delivery-1', experimentId: 'experiment-1', status: 'failed' },
    ]);
    webhookClient.send.mockResolvedValue({ status: 200, attempts: 2 });
    mockUpdateWhere(db);

    const result = await service.pushResults('project-1', 'experiment-1');

    expect(webhookClient.send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'delivered',
      responseStatus: 200,
      attempts: 2,
    });
  });

  it('marks the row failed and throws BadGatewayException when delivery fails', async () => {
    getResultsService.getResults.mockResolvedValue(VARIANT_RESULTS);
    mockInsertOnConflict(db, [
      { id: 'delivery-1', experimentId: 'experiment-1' },
    ]);
    webhookClient.send.mockRejectedValue(
      new WebhookDeliveryFailedError('webhook responded 500', 500, 4),
    );
    const updateWhere = mockUpdateWhere(db);

    await expect(
      service.pushResults('project-1', 'experiment-1'),
    ).rejects.toThrow(BadGatewayException);
    expect(updateWhere).toHaveBeenCalled();
  });
});
