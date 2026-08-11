import { buildTopology, DEFAULT_RETRY_TTL_MS, MAX_RETRIES } from './topology';

describe('buildTopology', () => {
  it('derives every queue/exchange name from the base queue name', () => {
    const topology = buildTopology('events');

    expect(topology).toEqual({
      queue: 'events',
      retryQueue: 'events.retry',
      parkedQueue: 'events.parked',
      dlxExchange: 'events.dlx',
      retryTtlMs: DEFAULT_RETRY_TTL_MS,
      queueArguments: { 'x-dead-letter-exchange': 'events.dlx' },
      retryQueueArguments: {
        'x-message-ttl': DEFAULT_RETRY_TTL_MS,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'events',
      },
    });
  });

  it('keeps dev and test topologies isolated by deriving from a different base name', () => {
    const topology = buildTopology('events_test');

    expect(topology.queue).toBe('events_test');
    expect(topology.retryQueue).toBe('events_test.retry');
    expect(topology.parkedQueue).toBe('events_test.parked');
    expect(topology.dlxExchange).toBe('events_test.dlx');
    expect(topology.retryQueueArguments['x-dead-letter-routing-key']).toBe(
      'events_test',
    );
  });

  it('accepts an overridden retry TTL, e.g. for fast e2e retry-timing tests', () => {
    const topology = buildTopology('events_test', 250);

    expect(topology.retryTtlMs).toBe(250);
    expect(topology.retryQueueArguments['x-message-ttl']).toBe(250);
  });

  it('exports the retry ceiling used to decide when a message gets parked', () => {
    expect(MAX_RETRIES).toBe(3);
  });
});
