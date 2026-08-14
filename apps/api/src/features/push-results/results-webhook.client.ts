import { Inject, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { WEBHOOK_CONFIG, WEBHOOK_HTTP } from './webhook.config';
import type { WebhookConfig, WebhookHttp } from './webhook.config';

// 4 attempts total (1 + 3 retries), true exponential backoff. Not M10's flat
// 5s x 3 — that shape came from RabbitMQ's one-TTL-per-retry-queue
// constraint, which doesn't apply to a synchronous HTTP call.
const BACKOFF_DELAYS_MS = [1000, 2000, 4000];
const MAX_RETRY_AFTER_MS = 30_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WebhookDeliveryFailedError extends Error {
  constructor(
    message: string,
    readonly lastStatus: number | undefined,
    readonly attempts: number,
  ) {
    super(message);
  }
}

export interface WebhookDeliveryResult {
  status: number;
  attempts: number;
}

@Injectable()
export class ResultsWebhookClient {
  constructor(
    @Inject(WEBHOOK_CONFIG) private readonly config: WebhookConfig,
    @Inject(WEBHOOK_HTTP) private readonly http: WebhookHttp,
  ) {}

  // Signs and sends `payload` once, retrying transient failures with the
  // same idempotency key on every attempt — a fresh key per retry would
  // defeat the receiver-side dedupe this key exists for.
  async send(
    idempotencyKey: string,
    payload: unknown,
  ): Promise<WebhookDeliveryResult> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = {
      'Content-Type': 'application/json',
      'X-SplitLab-Timestamp': String(timestamp),
      'X-SplitLab-Idempotency-Key': idempotencyKey,
      'X-SplitLab-Signature': `sha256=${this.sign(timestamp, body)}`,
    };

    let attempts = 0;
    let lastStatus: number | undefined;
    const maxAttempts = BACKOFF_DELAYS_MS.length + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      attempts++;
      const isLastAttempt = attempt === maxAttempts - 1;

      let response: Response;
      try {
        response = await this.http.post(
          this.config.url,
          body,
          headers,
          this.config.timeoutMs,
        );
      } catch {
        // Network failure, DNS error, or the fetch wrapper's own
        // AbortSignal.timeout firing — no response to classify, always
        // retryable up to the attempt budget.
        if (isLastAttempt) {
          throw new WebhookDeliveryFailedError(
            `Webhook delivery failed after ${attempts} attempt(s): network error`,
            lastStatus,
            attempts,
          );
        }
        await sleep(BACKOFF_DELAYS_MS[attempt]);
        continue;
      }

      lastStatus = response.status;

      if (response.status >= 200 && response.status < 300) {
        return { status: response.status, attempts };
      }

      if (!this.isRetryable(response.status) || isLastAttempt) {
        throw new WebhookDeliveryFailedError(
          `Webhook responded ${response.status} after ${attempts} attempt(s)`,
          response.status,
          attempts,
        );
      }

      const delay =
        response.status === 429
          ? (this.retryAfterDelayMs(response) ?? BACKOFF_DELAYS_MS[attempt])
          : BACKOFF_DELAYS_MS[attempt];
      await sleep(delay);
    }

    // Unreachable — the loop above always returns or throws before running
    // out of iterations, but TypeScript can't see that.
    throw new WebhookDeliveryFailedError(
      `Webhook delivery failed after ${attempts} attempt(s)`,
      lastStatus,
      attempts,
    );
  }

  private isRetryable(status: number): boolean {
    return status === 408 || status === 429 || status >= 500;
  }

  // Honors Retry-After (seconds or HTTP-date form), capped so a
  // hostile/misconfigured header can't stall the request indefinitely.
  // Missing or unparseable falls back to the normal exponential schedule.
  private retryAfterDelayMs(response: Response): number | undefined {
    const header = response.headers.get('retry-after');
    if (!header) {
      return undefined;
    }

    const seconds = Number(header);
    if (!Number.isNaN(seconds)) {
      return Math.min(Math.max(seconds, 0) * 1000, MAX_RETRY_AFTER_MS);
    }

    const dateMs = Date.parse(header);
    if (!Number.isNaN(dateMs)) {
      return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_AFTER_MS);
    }

    return undefined;
  }

  private sign(timestamp: number, body: string): string {
    return createHmac('sha256', this.config.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
  }
}
