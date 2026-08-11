import { ConsumeMessage } from 'amqplib';
import { retryCount } from './rmq-retry';

function messageWithHeaders(headers: Record<string, unknown>): ConsumeMessage {
  return {
    properties: { headers },
  } as ConsumeMessage;
}

describe('retryCount', () => {
  it('returns 0 when there is no x-death header at all (first delivery)', () => {
    expect(retryCount(messageWithHeaders({}), 'events')).toBe(0);
  });

  it('returns 0 when x-death is present but has no entry for this queue/reason', () => {
    const message = messageWithHeaders({
      'x-death': [
        { queue: 'events.retry', reason: 'expired', count: 3 },
        { queue: 'somewhere-else', reason: 'rejected', count: 5 },
      ],
    });

    expect(retryCount(message, 'events')).toBe(0);
  });

  it('returns the count from the matching {queue, reason: rejected} entry', () => {
    const message = messageWithHeaders({
      'x-death': [
        { queue: 'events.retry', reason: 'expired', count: 7 },
        { queue: 'events', reason: 'rejected', count: 2 },
      ],
    });

    expect(retryCount(message, 'events')).toBe(2);
  });
});
