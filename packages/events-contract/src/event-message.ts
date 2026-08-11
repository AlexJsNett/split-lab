// The one thing that genuinely must not drift between the two processes: the
// shape of a message published by apps/api and consumed by apps/event-processor.
// Everything else (DB schema, framework wiring) is deliberately NOT shared —
// see D3 in .omc/plans/m10-rabbitmq-second-service.md.

export type EventType = 'exposure' | 'conversion';

export interface EventMessage {
  experimentId: string;
  variantId: string;
  userId: string;
  type: EventType;
}

// One 'events' queue, two patterns — the pattern name travels inside Nest's
// JSON envelope (verified: ctx.getPattern() returns e.g. 'exposure') and
// doubles as the message's job name for observability in the RabbitMQ
// management UI. Producers call client.emit(EVENT_PATTERN.EXPOSURE, ...) and
// the worker declares @EventPattern(EVENT_PATTERN.EXPOSURE) — both sides read
// off these same constants so the string literal can't drift between them.
export const EVENT_PATTERN = {
  EXPOSURE: 'exposure',
  CONVERSION: 'conversion',
} as const;

export type EventPatternName = (typeof EVENT_PATTERN)[keyof typeof EVENT_PATTERN];
