import * as http from 'http';

export interface CapturedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export class MockUReportServer {
  private server: http.Server;
  private requests: CapturedRequest[] = [];
  private buildIdCounter = 1;
  public port = 0;

  constructor() {
    this.server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
      req.on('end', () => {
        let body: unknown = null;
        try { body = JSON.parse(raw); } catch { /* ignore */ }

        this.requests.push({
          method: req.method ?? 'GET',
          path: req.url ?? '/',
          headers: req.headers as Record<string, string | string[] | undefined>,
          body,
        });

        res.setHeader('Content-Type', 'application/json');

        if (req.url === '/api/build' && req.method === 'POST') {
          res.writeHead(201);
          res.end(JSON.stringify({ _id: `build-${this.buildIdCounter++}`, status: 'running' }));
        } else if (req.url?.startsWith('/api/build/status/calculate/') && req.method === 'POST') {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } else if (req.url === '/api/test/multi' && req.method === 'POST') {
          res.writeHead(201);
          res.end(JSON.stringify({ ok: true }));
        } else if (req.url === '/api/test_relation' && req.method === 'POST') {
          res.writeHead(201);
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'not found' }));
        }
      });
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address() as { port: number };
        this.port = addr.port;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  getRequests(): CapturedRequest[] {
    return [...this.requests];
  }

  clearRequests(): void {
    this.requests = [];
  }

  getRequestsTo(path: string): CapturedRequest[] {
    return this.requests.filter((r) => r.path === path);
  }
}
