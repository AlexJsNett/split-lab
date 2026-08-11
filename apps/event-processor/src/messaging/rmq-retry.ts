import { ConsumeMessage } from 'amqplib';

interface XDeathEntry {
  queue: string;
  reason: string;
  count: number;
}

// RabbitMQ appends an `x-death` header entry every time a message is
// dead-lettered, tracking which queue it was rejected from, why, and how many
// times. This is the mechanism that replaces the prior queue library's
// per-job attempt counter — there's no first-class "attempt count" on a
// RabbitMQ message, so the retry ceiling is read back out of this header
// instead. Verified incrementing 0 -> 1 -> 2 across real retry cycles
// (V8, M10 plan).
export function retryCount(message: ConsumeMessage, queue: string): number {
  const xDeath = message.properties.headers?.['x-death'] as
    XDeathEntry[] | undefined;

  if (!xDeath) {
    return 0;
  }

  const entry = xDeath.find(
    (death) => death.queue === queue && death.reason === 'rejected',
  );

  return entry?.count ?? 0;
}
