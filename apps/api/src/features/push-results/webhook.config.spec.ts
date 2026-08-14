import { ConfigService } from '@nestjs/config';
import { buildWebhookConfig } from './webhook.config';

function fakeConfigService(values: Record<string, string>): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (!(key in values)) {
        throw new Error(`Missing required env var ${key}`);
      }
      return values[key];
    },
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('buildWebhookConfig', () => {
  it('builds a config from a valid https URL', () => {
    const config = buildWebhookConfig(
      fakeConfigService({
        RESULTS_WEBHOOK_URL: 'https://webhook.site/abc',
        RESULTS_WEBHOOK_SECRET: 'shh',
        RESULTS_WEBHOOK_TIMEOUT_MS: '5000',
        NODE_ENV: 'production',
      }),
    );

    expect(config).toEqual({
      url: 'https://webhook.site/abc',
      secret: 'shh',
      timeoutMs: 5000,
    });
  });

  it('rejects a non-https URL outside of NODE_ENV=test', () => {
    expect(() =>
      buildWebhookConfig(
        fakeConfigService({
          RESULTS_WEBHOOK_URL: 'http://169.254.169.254/steal-creds',
          RESULTS_WEBHOOK_SECRET: 'shh',
          NODE_ENV: 'production',
        }),
      ),
    ).toThrow(/https/);
  });

  it('allows a non-https URL when NODE_ENV=test, for the e2e stub server', () => {
    const config = buildWebhookConfig(
      fakeConfigService({
        RESULTS_WEBHOOK_URL: 'http://localhost:4567/webhook',
        RESULTS_WEBHOOK_SECRET: 'shh',
        NODE_ENV: 'test',
      }),
    );

    expect(config.url).toEqual('http://localhost:4567/webhook');
  });

  it('fails fast when the secret is missing', () => {
    expect(() =>
      buildWebhookConfig(
        fakeConfigService({ RESULTS_WEBHOOK_URL: 'https://webhook.site/abc' }),
      ),
    ).toThrow('RESULTS_WEBHOOK_SECRET');
  });

  it('defaults the timeout to 5000ms when unset', () => {
    const config = buildWebhookConfig(
      fakeConfigService({
        RESULTS_WEBHOOK_URL: 'https://webhook.site/abc',
        RESULTS_WEBHOOK_SECRET: 'shh',
      }),
    );

    expect(config.timeoutMs).toEqual(5000);
  });
});
