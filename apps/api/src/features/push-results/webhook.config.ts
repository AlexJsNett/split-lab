import { ConfigService } from '@nestjs/config';

export const WEBHOOK_CONFIG = Symbol('WEBHOOK_CONFIG');
export const WEBHOOK_HTTP = Symbol('WEBHOOK_HTTP');

export interface WebhookConfig {
  url: string;
  secret: string;
  timeoutMs: number;
}

// Only https:// URLs are accepted — the target is never taken from a
// request, so a misconfigured internal/plaintext URL (SSRF) fails at boot
// instead of silently working. Test env gets an escape hatch because the
// e2e suite's stub server is a plain local http.createServer.
export function buildWebhookConfig(config: ConfigService): WebhookConfig {
  const url = config.getOrThrow<string>('RESULTS_WEBHOOK_URL');
  const secret = config.getOrThrow<string>('RESULTS_WEBHOOK_SECRET');
  const timeoutMs = Number(
    config.get<string>('RESULTS_WEBHOOK_TIMEOUT_MS', '5000'),
  );

  const protocol = new URL(url).protocol;
  const isTestEnv = config.get<string>('NODE_ENV') === 'test';
  if (protocol !== 'https:' && !isTestEnv) {
    throw new Error(
      `RESULTS_WEBHOOK_URL must use https:// — got '${protocol}//...'`,
    );
  }

  return { url, secret, timeoutMs };
}

// Thin wrapper around the global fetch (Node 20+), kept behind a DI token
// so results-webhook.client.ts never imports fetch directly — specs mock
// this token the same way every other spec in this repo mocks DRIZZLE,
// instead of stubbing a global.
export interface WebhookHttp {
  post(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<Response>;
}

async function webhookFetchPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export const fetchWebhookHttp: WebhookHttp = { post: webhookFetchPost };
