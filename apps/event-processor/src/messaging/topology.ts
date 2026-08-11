// Single source of truth for every queue/exchange name and argument object
// this service's RabbitMQ topology depends on. assert-topology.ts's raw
// amqplib pre-assertion and main.ts's ServerRMQ queueOptions both read the
// `queue` name and `queueArguments` from the same buildTopology() call, so
// the two assertions of the main queue can never drift and trigger a 406
// PRECONDITION_FAILED against each other (V9 in the M10 plan).
//
// Names are derived from the configured base queue name (RABBITMQ_QUEUE),
// not hardcoded to 'events' — dev and test each get their own topology
// (`events` / `events_test`) so runs never collide (D7).

export const MAX_RETRIES = 3;
export const DEFAULT_RETRY_TTL_MS = 5000;

export interface EventsTopology {
  queue: string;
  retryQueue: string;
  parkedQueue: string;
  dlxExchange: string;
  retryTtlMs: number;
  queueArguments: Record<string, unknown>;
  retryQueueArguments: Record<string, unknown>;
}

// retryTtlMs is overridable so e2e retry-timing tests can use a small value
// (e.g. 250ms) instead of being gated on real 5-second sleeps (see test plan).
export function buildTopology(
  queue: string,
  retryTtlMs: number = DEFAULT_RETRY_TTL_MS,
): EventsTopology {
  const dlxExchange = `${queue}.dlx`;
  const retryQueue = `${queue}.retry`;
  const parkedQueue = `${queue}.parked`;

  return {
    queue,
    retryQueue,
    parkedQueue,
    dlxExchange,
    retryTtlMs,
    queueArguments: {
      'x-dead-letter-exchange': dlxExchange,
    },
    retryQueueArguments: {
      'x-message-ttl': retryTtlMs,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': queue,
    },
  };
}
