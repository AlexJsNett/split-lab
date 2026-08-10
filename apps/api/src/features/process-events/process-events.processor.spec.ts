import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DRIZZLE } from '@/db/drizzle.module';
import {
  EventJobData,
  ProcessEventsProcessor,
} from './process-events.processor';

type MockDb = {
  insert: jest.Mock;
};

function createMockDb(): MockDb {
  return { insert: jest.fn() };
}

function mockInsert(db: MockDb) {
  const valuesFn = jest.fn().mockResolvedValue(undefined);
  db.insert.mockReturnValueOnce({ values: valuesFn });
  return valuesFn;
}

function createJob(data: EventJobData): Job<EventJobData> {
  return { data } as Job<EventJobData>;
}

describe('ProcessEventsProcessor', () => {
  let processor: ProcessEventsProcessor;
  let db: MockDb;

  beforeEach(async () => {
    db = createMockDb();

    const module = await Test.createTestingModule({
      providers: [ProcessEventsProcessor, { provide: DRIZZLE, useValue: db }],
    }).compile();

    processor = module.get(ProcessEventsProcessor);
  });

  it('writes an exposure event to the events table', async () => {
    const valuesFn = mockInsert(db);
    const job = createJob({
      experimentId: 'experiment-1',
      variantId: 'variant-1',
      userId: 'user-42',
      type: 'exposure',
    });

    await processor.process(job);

    expect(valuesFn).toHaveBeenCalledWith({
      experimentId: 'experiment-1',
      variantId: 'variant-1',
      userId: 'user-42',
      type: 'exposure',
    });
  });

  it('writes a conversion event to the events table', async () => {
    const valuesFn = mockInsert(db);
    const job = createJob({
      experimentId: 'experiment-1',
      variantId: 'variant-1',
      userId: 'user-42',
      type: 'conversion',
    });

    await processor.process(job);

    expect(valuesFn).toHaveBeenCalledWith({
      experimentId: 'experiment-1',
      variantId: 'variant-1',
      userId: 'user-42',
      type: 'conversion',
    });
  });
});
