import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { ReconcileParkedEventsService } from './reconcile-parked-events.service';

jest.mock('amqplib');

describe('ReconcileParkedEventsService', () => {
  let service: ReconcileParkedEventsService;
  let channel: {
    get: jest.Mock;
    sendToQueue: jest.Mock;
    ack: jest.Mock;
    close: jest.Mock;
  };
  let connection: { createChannel: jest.Mock; close: jest.Mock };
  let config: { getOrThrow: jest.Mock };

  beforeEach(async () => {
    channel = {
      get: jest.fn(),
      sendToQueue: jest.fn(),
      ack: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    connection = {
      createChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'RABBITMQ_URL' ? 'amqp://localhost' : 'events',
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        ReconcileParkedEventsService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(ReconcileParkedEventsService);
  });

  it('is a no-op when the parking lot is empty', async () => {
    channel.get.mockResolvedValue(false);

    await service.reconcileParkedEvents();

    expect(channel.get).toHaveBeenCalledWith('events.parked', {
      noAck: false,
    });
    expect(channel.sendToQueue).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('republishes and acks every parked message, one at a time, until the queue is empty', async () => {
    const messages = [
      { content: Buffer.from('{"pattern":"exposure","data":{}}') },
      { content: Buffer.from('{"pattern":"conversion","data":{}}') },
      { content: Buffer.from('{"pattern":"exposure","data":{}}') },
    ];
    channel.get
      .mockResolvedValueOnce(messages[0])
      .mockResolvedValueOnce(messages[1])
      .mockResolvedValueOnce(messages[2])
      .mockResolvedValueOnce(false);

    await service.reconcileParkedEvents();

    expect(channel.sendToQueue).toHaveBeenCalledTimes(3);
    for (const message of messages) {
      expect(channel.sendToQueue).toHaveBeenCalledWith(
        'events',
        message.content,
        { persistent: true },
      );
      expect(channel.ack).toHaveBeenCalledWith(message);
    }
    expect(channel.ack).toHaveBeenCalledTimes(3);
  });
});
