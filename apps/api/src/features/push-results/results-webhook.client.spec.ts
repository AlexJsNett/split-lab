import { createHmac } from 'node:crypto';
import {
  ResultsWebhookClient,
  WebhookDeliveryFailedError,
} from './results-webhook.client';
import type { WebhookConfig, WebhookHttp } from './webhook.config';

function fakeResponse(
  status: number,
  headers: Record<string, string> = {},
): Response {
  const lower = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    status,
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
  } as Response;
}

const CONFIG: WebhookConfig = {
  url: 'https://webhook.site/test-target',
  secret: 'test-secret',
  timeoutMs: 5000,
};

describe('ResultsWebhookClient', () => {
  let http: { post: jest.Mock };
  let client: ResultsWebhookClient;

  beforeEach(() => {
    jest.useFakeTimers();
    http = { post: jest.fn() };
    client = new ResultsWebhookClient(CONFIG, http as unknown as WebhookHttp);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('signs and posts the payload, verifiable against the shared secret', async () => {
    http.post.mockResolvedValueOnce(fakeResponse(200));

    const result = await client.send('key-1', { variantId: 'v1' });

    expect(result).toEqual({ status: 200, attempts: 1 });
    expect(http.post).toHaveBeenCalledTimes(1);

    const [url, body, headers, timeoutMs] = http.post.mock.calls[0] as [
      string,
      string,
      Record<string, string>,
      number,
    ];
    expect(url).toEqual(CONFIG.url);
    expect(timeoutMs).toEqual(CONFIG.timeoutMs);
    expect(body).toEqual(JSON.stringify({ variantId: 'v1' }));
    expect(headers['Content-Type']).toEqual('application/json');
    expect(headers['X-SplitLab-Idempotency-Key']).toEqual('key-1');

    const timestamp = headers['X-SplitLab-Timestamp'];
    const expectedSignature = `sha256=${createHmac('sha256', CONFIG.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')}`;
    expect(headers['X-SplitLab-Signature']).toEqual(expectedSignature);
  });

  it('retries a 500 and succeeds on the second attempt after a 1000ms delay', async () => {
    http.post
      .mockResolvedValueOnce(fakeResponse(500))
      .mockResolvedValueOnce(fakeResponse(200));

    const resultPromise = client.send('key-1', {});
    await jest.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toEqual({ status: 200, attempts: 2 });
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('throws after 4 attempts against a persistent 500', async () => {
    http.post.mockResolvedValue(fakeResponse(500));

    const resultPromise = client.send('key-1', {});
    const assertion = expect(resultPromise).rejects.toThrow(
      WebhookDeliveryFailedError,
    );

    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(4000);

    await assertion;
    expect(http.post).toHaveBeenCalledTimes(4);
  });

  it('honors Retry-After (seconds) on a 429 instead of the default backoff', async () => {
    http.post
      .mockResolvedValueOnce(fakeResponse(429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(fakeResponse(200));

    const resultPromise = client.send('key-1', {});

    // default schedule would be 1000ms — advancing only that far must NOT
    // be enough, proving Retry-After's 2000ms is what's actually honored.
    await jest.advanceTimersByTimeAsync(1000);
    expect(http.post).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toEqual({ status: 200, attempts: 2 });
  });

  it('caps an oversized Retry-After at 30 seconds', async () => {
    http.post
      .mockResolvedValueOnce(fakeResponse(429, { 'Retry-After': '9999' }))
      .mockResolvedValueOnce(fakeResponse(200));

    const resultPromise = client.send('key-1', {});

    await jest.advanceTimersByTimeAsync(30_000);
    const result = await resultPromise;

    expect(result).toEqual({ status: 200, attempts: 2 });
  });

  it('falls back to the normal schedule when Retry-After is unparseable', async () => {
    http.post
      .mockResolvedValueOnce(fakeResponse(429, { 'Retry-After': 'garbage' }))
      .mockResolvedValueOnce(fakeResponse(200));

    const resultPromise = client.send('key-1', {});
    await jest.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toEqual({ status: 200, attempts: 2 });
  });

  it('retries a 408 like a 5xx', async () => {
    http.post
      .mockResolvedValueOnce(fakeResponse(408))
      .mockResolvedValueOnce(fakeResponse(200));

    const resultPromise = client.send('key-1', {});
    await jest.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toEqual({ status: 200, attempts: 2 });
  });

  it('retries a network/timeout failure with no response to classify', async () => {
    http.post
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(fakeResponse(200));

    const resultPromise = client.send('key-1', {});
    await jest.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toEqual({ status: 200, attempts: 2 });
  });

  it('does not retry a permanent 4xx like 400', async () => {
    http.post.mockResolvedValueOnce(fakeResponse(400));

    await expect(client.send('key-1', {})).rejects.toThrow(
      WebhookDeliveryFailedError,
    );
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('does not retry a permanent 4xx like 401', async () => {
    http.post.mockResolvedValueOnce(fakeResponse(401));

    await expect(client.send('key-1', {})).rejects.toThrow(
      WebhookDeliveryFailedError,
    );
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('reuses the same idempotency key and signature across every retry', async () => {
    http.post
      .mockResolvedValueOnce(fakeResponse(500))
      .mockResolvedValueOnce(fakeResponse(500))
      .mockResolvedValueOnce(fakeResponse(200));

    const resultPromise = client.send('key-1', { a: 1 });
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    await resultPromise;

    const headerSets = http.post.mock.calls.map(
      (call) => call[2] as Record<string, string>,
    );
    const keys = headerSets.map((h) => h['X-SplitLab-Idempotency-Key']);
    const signatures = headerSets.map((h) => h['X-SplitLab-Signature']);
    expect(new Set(keys).size).toEqual(1);
    expect(new Set(signatures).size).toEqual(1);
  });
});
