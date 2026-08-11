import * as amqp from 'amqplib';
import { assertTopology } from './assert-topology';
import { buildTopology } from './topology';

jest.mock('amqplib');

describe('assertTopology', () => {
  it('issues the exact assert/bind calls with the exact argument objects, then closes', async () => {
    const channel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connection = {
      createChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    const topology = buildTopology('events');
    await assertTopology('amqp://splitlab:splitlab@localhost:5672', topology);

    expect(amqp.connect).toHaveBeenCalledWith(
      'amqp://splitlab:splitlab@localhost:5672',
    );
    expect(channel.assertExchange).toHaveBeenCalledWith(
      'events.dlx',
      'direct',
      {
        durable: true,
      },
    );
    expect(channel.assertQueue).toHaveBeenNthCalledWith(1, 'events', {
      durable: true,
      arguments: { 'x-dead-letter-exchange': 'events.dlx' },
    });
    expect(channel.assertQueue).toHaveBeenNthCalledWith(2, 'events.retry', {
      durable: true,
      arguments: {
        'x-message-ttl': 5000,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'events',
      },
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'events.retry',
      'events.dlx',
      'events',
    );
    expect(channel.assertQueue).toHaveBeenNthCalledWith(3, 'events.parked', {
      durable: true,
    });
    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('still closes the channel and connection when an assertion throws', async () => {
    const channel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest
        .fn()
        .mockRejectedValue(new Error('406 PRECONDITION_FAILED')),
      bindQueue: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connection = {
      createChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    await expect(
      assertTopology('amqp://localhost', buildTopology('events')),
    ).rejects.toThrow('406 PRECONDITION_FAILED');

    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
});
