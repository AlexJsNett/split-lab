import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RmqContext } from '@nestjs/microservices';
import { EventMessage } from '@split-lab/events-contract';
import { DRIZZLE } from '@/db/drizzle.module';
import { ProcessEventsController } from './process-events.controller';

type MockDb = { insert: jest.Mock };

function createMockDb(): MockDb {
  return { insert: jest.fn() };
}

function mockInsert(db: MockDb, resolvedValue: unknown = undefined) {
  const valuesFn = jest.fn().mockResolvedValue(resolvedValue);
  db.insert.mockReturnValueOnce({ values: valuesFn });
  return valuesFn;
}

function mockInsertFailure(db: MockDb, error: Error) {
  const valuesFn = jest.fn().mockRejectedValue(error);
  db.insert.mockReturnValueOnce({ values: valuesFn });
  return valuesFn;
}

function fakeContext(xDeathCount?: number): {
  ctx: RmqContext;
  channel: { ack: jest.Mock; nack: jest.Mock; sendToQueue: jest.Mock };
  raw: { content: Buffer; properties: { headers: Record<string, unknown> } };
} {
  const channel = {
    ack: jest.fn(),
    nack: jest.fn(),
    sendToQueue: jest.fn(),
  };
  const raw = {
    content: Buffer.from('{"pattern":"exposure","data":{}}'),
    properties: {
      headers:
        xDeathCount === undefined
          ? {}
          : {
              'x-death': [
                { queue: 'events', reason: 'rejected', count: xDeathCount },
              ],
            },
    },
  };
  const ctx = {
    getChannelRef: () => channel,
    getMessage: () => raw,
  } as unknown as RmqContext;

  return { ctx, channel, raw };
}

describe('ProcessEventsController', () => {
  let controller: ProcessEventsController;
  let db: MockDb;
  let config: { getOrThrow: jest.Mock };

  beforeEach(async () => {
    db = createMockDb();
    config = { getOrThrow: jest.fn().mockReturnValue('events') };

    const module = await Test.createTestingModule({
      controllers: [ProcessEventsController],
      providers: [
        { provide: DRIZZLE, useValue: db },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    controller = module.get(ProcessEventsController);
  });

  const message: EventMessage = {
    experimentId: 'experiment-1',
    variantId: 'variant-1',
    userId: 'user-42',
    type: 'exposure',
  };

  it('persists and acks on success, inserting exactly the payload fields', async () => {
    const valuesFn = mockInsert(db);
    const { ctx, channel } = fakeContext();

    await controller.handleExposure(message, ctx);

    expect(valuesFn).toHaveBeenCalledWith(message);
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('also persists and acks conversion messages via the same path', async () => {
    const valuesFn = mockInsert(db);
    const { ctx, channel } = fakeContext();
    const conversion: EventMessage = { ...message, type: 'conversion' };

    await controller.handleConversion(conversion, ctx);

    expect(valuesFn).toHaveBeenCalledWith(conversion);
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('nacks (requeue=false) without acking when the insert fails and the retry ceiling is not yet reached', async () => {
    mockInsertFailure(db, new Error('connection refused'));
    const { ctx, channel, raw } = fakeContext(1); // under MAX_RETRIES (3)

    await controller.handleExposure(message, ctx);

    expect(channel.nack).toHaveBeenCalledWith(raw, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('parks the original envelope and acks once the retry ceiling is reached', async () => {
    mockInsertFailure(db, new Error('connection refused'));
    const { ctx, channel, raw } = fakeContext(3); // at MAX_RETRIES (3)

    await controller.handleExposure(message, ctx);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'events.parked',
      raw.content,
      { persistent: true },
    );
    expect(channel.ack).toHaveBeenCalledWith(raw);
    expect(channel.nack).not.toHaveBeenCalled();
  });
});
