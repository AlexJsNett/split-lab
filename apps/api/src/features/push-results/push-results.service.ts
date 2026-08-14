import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { webhookDeliveries } from '@/entities/webhook-delivery/infrastructure/webhook-delivery.schema';
import {
  GetResultsService,
  VariantResult,
} from '@/features/get-results/get-results.service';
import {
  ResultsWebhookClient,
  WebhookDeliveryFailedError,
} from './results-webhook.client';

export type PushResultsOutcome =
  | { status: 'delivered'; responseStatus: number; attempts: number }
  | { status: 'duplicate' };

@Injectable()
export class PushResultsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly getResultsService: GetResultsService,
    private readonly webhookClient: ResultsWebhookClient,
  ) {}

  async pushResults(
    projectId: string,
    experimentId: string,
  ): Promise<PushResultsOutcome> {
    // Throws NotFoundException if the experiment doesn't exist — before any
    // insert or network call, matching every other feature's 404 timing.
    const results = await this.getResultsService.getResults(
      projectId,
      experimentId,
    );
    const idempotencyKey = this.computeIdempotencyKey(experimentId, results);

    // The unique constraint on idempotencyKey, not this lookup, is what
    // actually closes the race between two concurrent pushes for the same
    // content — onConflictDoNothing() returning nothing means someone else
    // (this request or a concurrent one) already owns that key.
    const [inserted] = await this.db
      .insert(webhookDeliveries)
      .values({ experimentId, idempotencyKey })
      .onConflictDoNothing()
      .returning();

    let deliveryId: string;
    if (inserted) {
      deliveryId = inserted.id;
    } else {
      const [existing] = await this.db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.idempotencyKey, idempotencyKey));
      if (existing.status === 'delivered') {
        return { status: 'duplicate' };
      }
      deliveryId = existing.id;
    }

    try {
      const delivery = await this.webhookClient.send(idempotencyKey, results);
      await this.db
        .update(webhookDeliveries)
        .set({
          status: 'delivered',
          responseStatus: delivery.status,
          attempts: delivery.attempts,
          deliveredAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, deliveryId));
      return {
        status: 'delivered',
        responseStatus: delivery.status,
        attempts: delivery.attempts,
      };
    } catch (error) {
      const attempts =
        error instanceof WebhookDeliveryFailedError ? error.attempts : 0;
      await this.db
        .update(webhookDeliveries)
        .set({ status: 'failed', attempts })
        .where(eq(webhookDeliveries.id, deliveryId));
      throw new BadGatewayException('Failed to deliver results webhook');
    }
  }

  // Deterministic: the same experiment with the same numbers always hashes
  // to the same key, so an operator clicking "push" twice on unchanged
  // results never sends twice. getResults() has no ORDER BY, so row order
  // isn't guaranteed — sort here or the same data could hash two ways.
  private computeIdempotencyKey(
    experimentId: string,
    results: VariantResult[],
  ): string {
    const sorted = [...results].sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    );
    return createHash('sha256')
      .update(`${experimentId}:${JSON.stringify(sorted)}`)
      .digest('hex');
  }
}
