import * as amqp from 'amqplib';
import { EventsTopology } from './topology';

// This worker is the sole owner of the RabbitMQ topology (D5, M10 plan).
// Nest's ServerRMQ only ever asserts the main queue it listens on — it never
// declares the DLX exchange, the retry queue, or the parking queue the retry
// mechanism depends on, so those have to be asserted explicitly, once, before
// the microservice starts listening. Producers connect with `noAssert: true`
// (V9) specifically so they never re-declare any of this with different
// arguments and crash the process with an uncaught 406.
//
// Exact sequence verified against a real RabbitMQ 4 container (V8):
//   exchange events.dlx        (direct, durable)
//   queue    events            (durable, x-dead-letter-exchange = events.dlx)
//   queue    events.retry      (durable, x-message-ttl, dead-letters back to
//                               the default exchange with routing key = queue)
//   bind     events.retry -> events.dlx, routing key = queue
//   queue    events.parked     (durable)
//
// The producer publishes with sendToQueue, so a message's routing key is the
// queue name itself, and dead-lettering preserves that routing key — which is
// why the retry queue is bound to the DLX with routing key = the queue name.
export async function assertTopology(
  url: string,
  topology: EventsTopology,
): Promise<void> {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();

  try {
    await channel.assertExchange(topology.dlxExchange, 'direct', {
      durable: true,
    });
    await channel.assertQueue(topology.queue, {
      durable: true,
      arguments: topology.queueArguments,
    });
    await channel.assertQueue(topology.retryQueue, {
      durable: true,
      arguments: topology.retryQueueArguments,
    });
    await channel.bindQueue(
      topology.retryQueue,
      topology.dlxExchange,
      topology.queue,
    );
    await channel.assertQueue(topology.parkedQueue, { durable: true });
  } finally {
    await channel.close();
    await connection.close();
  }
}
