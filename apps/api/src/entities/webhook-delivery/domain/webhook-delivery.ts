export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface WebhookDelivery {
  id: string;
  experimentId: string;
  idempotencyKey: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseStatus: number | null;
  createdAt: Date;
  deliveredAt: Date | null;
}
