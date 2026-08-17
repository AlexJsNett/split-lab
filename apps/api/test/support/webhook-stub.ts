import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface CapturedRequest {
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface WebhookStub {
  url: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

// A throwaway local HTTP server standing in for webhook.site in the
// automated e2e suite — real network round-trip (real headers, real body
// bytes), just not the real external service. That one still gets a
// manual/live check separately, since it can't be scripted deterministically.
export async function startWebhookStub(): Promise<WebhookStub> {
  const requests: CapturedRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/webhook`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
