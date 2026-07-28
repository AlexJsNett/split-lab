export type EventType = 'exposure' | 'conversion';

export interface Event {
  id: string;
  experimentId: string;
  variantId: string;
  userId: string;
  type: EventType;
  createdAt: Date;
}
