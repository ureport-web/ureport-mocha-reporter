import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { MockUReportServer } from './mock-server.js';

const ROOT = path.resolve(__dirname, '../..');
const REPORTER_PATH = path.join(ROOT, 'dist/cjs/mocha.js');
const MOCHA_BIN = path.join(ROOT, 'node_modules/.bin/mocha');

interface SubprocessResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runMocha(
  specFile: string,
  serverPort: number,
  extraOpts: string[] = [],
): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    const reporterOpts = [
      `serverUrl=http://127.0.0.1:${serverPort}`,
      'apiToken=integration-token',
      'product=TestProduct',
      'type=E2E',
    ].join(',');

    const args = [
      '--reporter', REPORTER_PATH,
      '--reporter-options', reporterOpts,
      ...extraOpts,
      specFile,
    ];

    let stdout = '';
    let stderr = '';

    const child = spawn(MOCHA_BIN, args, {
      cwd: ROOT,
      env: { ...process.env },
    });

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

function runMochaWithExtraOptions(
  specFile: string,
  serverPort: number,
  extraReporterOpts: Record<string, string | number | boolean>,
  extraArgs: string[] = [],
): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    const reporterOptsList = [
      `serverUrl=http://127.0.0.1:${serverPort}`,
      'apiToken=integration-token',
      'product=TestProduct',
      'type=E2E',
      ...Object.entries(extraReporterOpts).map(([k, v]) => `${k}=${v}`),
    ].join(',');

    const args = [
      '--reporter', REPORTER_PATH,
      '--reporter-options', reporterOptsList,
      ...extraArgs,
      specFile,
    ];

    let stdout = '';
    let stderr = '';

    const child = spawn(MOCHA_BIN, args, {
      cwd: ROOT,
      env: { ...process.env },
    });

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

const SAMPLE_SPEC = path.join(ROOT, 'tests/integration/fixtures/sample.spec.js');
const RETRIES_SPEC = path.join(ROOT, 'tests/integration/fixtures/retries.spec.js');

beforeAll(() => {
  if (!fs.existsSync(REPORTER_PATH)) {
    throw new Error(
      `Built Mocha reporter entry not found at ${REPORTER_PATH}. Run "npm run build" before integration tests.`
    );
  }
});

describe('Integration: sample.spec.js (default config)', () => {
  let server: MockUReportServer;

  beforeAll(async () => {
    server = new MockUReportServer();
    await server.start();
    await runMocha(SAMPLE_SPEC, server.port);
  });

  afterAll(async () => { await server.stop(); });

  it('creates build before tests', () => {
    const buildReqs = server.getRequestsTo('/api/build');
    expect(buildReqs.length).toBeGreaterThanOrEqual(1);
    const b = buildReqs[0].body as Record<string, unknown>;
    expect(b.product).toBe('TestProduct');
    expect(b.type).toBe('E2E');
    expect(typeof b.start_time).toBe('string');
  });

  it('sends Authorization Bearer token on every call', () => {
    for (const req of server.getRequests()) {
      if (req.path === '/api/build' || req.path === '/api/test/multi' || req.path === '/api/test_relation' || req.path.startsWith('/api/build/status')) {
        expect(req.headers['authorization']).toBe('Bearer integration-token');
      }
    }
  });

  it('submits 7 tests total', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: unknown[] }).tests);
    expect(all).toHaveLength(7);
  });

  it('passing test has status=PASS, is_rerun=false, no failure', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    const passing = all.find((t) => (t.name as string).includes('passing test'));
    expect(passing).toBeDefined();
    expect(passing!.status).toBe('PASS');
    expect(passing!.is_rerun).toBe(false);
    expect(passing!.failure).toBeUndefined();
  });

  it('failing test has status=FAIL with error_message', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    const failing = all.find((t) => (t.name as string).includes('failing test'));
    expect(failing).toBeDefined();
    expect(failing!.status).toBe('FAIL');
    expect((failing!.failure as { error_message: string }).error_message).toBeTruthy();
  });

  it('skipped test has status=SKIP', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    const skipped = all.find((t) => (t.name as string).includes('skipped test'));
    expect(skipped).toBeDefined();
    expect(skipped!.status).toBe('SKIP');
  });

  it('annotated uid test has uid=TC-CUSTOM-001', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    const annotated = all.find((t) => t.uid === 'TC-CUSTOM-001');
    expect(annotated).toBeDefined();
  });

  it('@smoke in title extracted to info.tags', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    const tagged = all.find((t) => (t.name as string).includes('@smoke'));
    expect(tagged).toBeDefined();
    const info = tagged!.info as { tags: string[] };
    expect(info.tags).toContain('smoke');
  });

  it('components/teams from ureport() in info', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    const t = all.find((t) => (t.name as string).includes('tags and components'));
    expect(t).toBeDefined();
    const info = t!.info as { components: string[]; teams: string[] };
    expect(info.components).toContain('auth');
    expect(info.teams).toContain('backend');
  });

  it('every test has info.file, info.path, info.duration', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    for (const t of all) {
      const info = t.info as Record<string, unknown>;
      // Skipped tests may have empty file/path when Mocha doesn't set test.file on pending tests
      if (t.status !== 'SKIP') {
        expect(typeof info.file).toBe('string');
        expect(typeof info.path).toBe('string');
      }
      expect(typeof info.duration).toBe('string');
    }
  });

  it('one test_relation per unique uid', () => {
    const relationReqs = server.getRequestsTo('/api/test_relation');
    expect(relationReqs).toHaveLength(7);
  });

  it('relations arrive after finalize', () => {
    const reqs = server.getRequests();
    const finalizeIdx = reqs.findIndex((r) => r.path.startsWith('/api/build/status/calculate/'));
    const firstRelationIdx = reqs.findIndex((r) => r.path === '/api/test_relation');
    expect(finalizeIdx).toBeGreaterThanOrEqual(0);
    expect(firstRelationIdx).toBeGreaterThan(finalizeIdx);
  });
});

describe('Integration: retries.spec.js', () => {
  let server: MockUReportServer;

  beforeAll(async () => {
    server = new MockUReportServer();
    await server.start();
    await runMocha(RETRIES_SPEC, server.port);
  });

  afterAll(async () => { await server.stop(); });

  // NOTE: Mocha fires 'test end' only ONCE per test — after the final retry attempt.
  // So 2 tests with this.retries(1) → 2 submissions (not 4).
  // test.currentRetry() on the final attempt reflects which attempt it was.
  it('submits 2 test results (one per test — Mocha emits test end once per test, not per attempt)', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    expect(all).toHaveLength(2);
  });

  it('flaky test: final result is RERUN_PASS with is_rerun=true (passed on retry 1)', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    const flaky = all.find((t) => (t.name as string).includes('flaky test'));
    expect(flaky).toBeDefined();
    expect(flaky!.status).toBe('RERUN_PASS');
    expect(flaky!.is_rerun).toBe(true);
  });

  it('always-failing: final result is FAIL with is_rerun=true (failed on retry 1)', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    const always = all.find((t) => (t.name as string).includes('always failing'));
    expect(always).toBeDefined();
    expect(always!.status).toBe('FAIL');
    expect(always!.is_rerun).toBe(true);
  });

  it('all results reference same buildId', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: Array<Record<string, unknown>> }).tests);
    const buildIds = [...new Set(all.map((t) => t.build))];
    expect(buildIds).toHaveLength(1);
  });
});

describe('Integration: saveRelations=false', () => {
  let server: MockUReportServer;

  beforeAll(async () => {
    server = new MockUReportServer();
    await server.start();
    await runMochaWithExtraOptions(SAMPLE_SPEC, server.port, { saveRelations: false });
  });

  afterAll(async () => { await server.stop(); });

  it('no /api/test_relation calls', () => {
    expect(server.getRequestsTo('/api/test_relation')).toHaveLength(0);
  });

  it('build and tests still submitted', () => {
    expect(server.getRequestsTo('/api/build')).toHaveLength(1);
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: unknown[] }).tests);
    expect(all.length).toBeGreaterThan(0);
  });
});

describe('Integration: batchSize=2 with 7 tests', () => {
  let server: MockUReportServer;

  beforeAll(async () => {
    server = new MockUReportServer();
    await server.start();
    await runMochaWithExtraOptions(SAMPLE_SPEC, server.port, { batchSize: 2 });
  });

  afterAll(async () => { await server.stop(); });

  it('4 POST /api/test/multi calls (batches: 2, 2, 2, 1)', () => {
    expect(server.getRequestsTo('/api/test/multi')).toHaveLength(4);
  });

  it('all 7 tests present across batches', () => {
    const testReqs = server.getRequestsTo('/api/test/multi');
    const all = testReqs.flatMap((r) => (r.body as { tests: unknown[] }).tests);
    expect(all).toHaveLength(7);
  });

  it('finalize called once after all batches', () => {
    const finalizeReqs = server.getRequests().filter((r) => r.path.startsWith('/api/build/status/calculate/'));
    expect(finalizeReqs).toHaveLength(1);
  });
});

describe('Integration: outputFile', () => {
  let server: MockUReportServer;
  let outputPath: string;

  beforeAll(async () => {
    server = new MockUReportServer();
    await server.start();
    outputPath = path.join(os.tmpdir(), `ureport-mocha-output-${Date.now()}.json`);
    await runMochaWithExtraOptions(SAMPLE_SPEC, server.port, { outputFile: outputPath });
  });

  afterAll(async () => {
    await server.stop();
    try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
  });

  it('output file created with valid JSON containing build, tests, relations', () => {
    expect(fs.existsSync(outputPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as {
      build: unknown;
      tests: unknown[];
      relations: unknown[];
    };
    expect(content.build).toBeDefined();
    expect(Array.isArray(content.tests)).toBe(true);
    expect(Array.isArray(content.relations)).toBe(true);
    expect(content.tests.length).toBeGreaterThan(0);
  });
});
