# Async Processing & Messaging (BullMQ / RabbitMQ)

Not written yet — lands with M9 (Redis + BullMQ queue for event ingestion) and M10
(RabbitMQ + a second NestJS service).

Fill in here once M9/M10 land:
- Which events go through the queue vs stay synchronous, and why.
- Queue/worker module layout.
- Once M10 lands: how the two services communicate over RabbitMQ (exchange/queue naming,
  message contract, what happens on a failed delivery).
