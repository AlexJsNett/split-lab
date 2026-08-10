import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ReconcileFailedEventsService } from './reconcile-failed-events.service';

describe('ReconcileFailedEventsService', () => {
  let service: ReconcileFailedEventsService;
  let eventsQueue: { getFailed: jest.Mock };

  beforeEach(async () => {
    eventsQueue = { getFailed: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ReconcileFailedEventsService,
        { provide: getQueueToken('events'), useValue: eventsQueue },
      ],
    }).compile();

    service = module.get(ReconcileFailedEventsService);
  });

  it('retries every job currently sitting in the failed set', async () => {
    const failedJobs = [
      { retry: jest.fn().mockResolvedValue(undefined) },
      { retry: jest.fn().mockResolvedValue(undefined) },
      { retry: jest.fn().mockResolvedValue(undefined) },
    ];
    eventsQueue.getFailed.mockResolvedValue(failedJobs);

    await service.reconcileFailedEvents();

    for (const job of failedJobs) {
      expect(job.retry).toHaveBeenCalledTimes(1);
    }
  });

  it('is a no-op when there are no failed jobs', async () => {
    eventsQueue.getFailed.mockResolvedValue([]);

    await expect(service.reconcileFailedEvents()).resolves.toBeUndefined();
  });
});
