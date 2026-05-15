import { mapStatus, mapTestToPayload, mapToRelationPayload } from '../src/mapper.js';
import type { UReportMochaReporterOptions } from '../src/config.js';
import type { UReportMeta } from '../src/helper.js';
import type Mocha from 'mocha';

const baseOptions: UReportMochaReporterOptions = {
  serverUrl: 'http://localhost:3000',
  apiToken: 'token',
  product: 'TestProduct',
  type: 'unit',
  batchSize: 50,
  saveRelations: true,
  autoDetectPlatform: false,
};

function makeMochaTest(overrides: {
  fullTitle?: string;
  title?: string;
  file?: string;
  duration?: number;
  state?: 'passed' | 'failed' | 'pending';
  err?: Error;
  currentRetry?: number;
}): Mocha.Test {
  const {
    fullTitle = 'Suite test name',
    title = 'test name',
    file = '/project/tests/foo.spec.js',
    duration = 100,
    state = 'passed',
    err,
    currentRetry = 0,
  } = overrides;

  return {
    fullTitle: () => fullTitle,
    title,
    file,
    duration,
    state,
    err,
    currentRetry: () => currentRetry,
  } as unknown as Mocha.Test;
}

describe('mapStatus', () => {
  it("'passed' + retry=0 → 'PASS'", () => {
    expect(mapStatus('passed', 0)).toBe('PASS');
  });

  it("'passed' + retry>0 → 'RERUN_PASS'", () => {
    expect(mapStatus('passed', 1)).toBe('RERUN_PASS');
  });

  it("'failed' + retry=0 → 'FAIL'", () => {
    expect(mapStatus('failed', 0)).toBe('FAIL');
  });

  it("'failed' + retry>0 → 'FAIL'", () => {
    expect(mapStatus('failed', 2)).toBe('FAIL');
  });

  it("'pending' → 'SKIP'", () => {
    expect(mapStatus('pending', 0)).toBe('SKIP');
  });

  it("undefined → 'SKIP'", () => {
    expect(mapStatus(undefined, 0)).toBe('SKIP');
  });
});

describe('mapTestToPayload', () => {
  it('uid falls back to fullTitle() when no meta', () => {
    const test = makeMochaTest({ fullTitle: 'Suite > my test' });
    const p = mapTestToPayload(test, 'build-1', null, baseOptions);
    expect(p.uid).toBe('Suite > my test');
  });

  it('uid from meta overrides fullTitle()', () => {
    const test = makeMochaTest({ fullTitle: 'Suite > my test' });
    const meta: UReportMeta = { uid: 'TC-001' };
    const p = mapTestToPayload(test, 'build-1', meta, baseOptions);
    expect(p.uid).toBe('TC-001');
  });

  it('retry=0 + passed → PASS, is_rerun=false', () => {
    const test = makeMochaTest({ state: 'passed', currentRetry: 0 });
    const p = mapTestToPayload(test, 'build-1', null, baseOptions);
    expect(p.status).toBe('PASS');
    expect(p.is_rerun).toBe(false);
  });

  it('retry>0 + passed → RERUN_PASS, is_rerun=true', () => {
    const test = makeMochaTest({ state: 'passed', currentRetry: 1 });
    const p = mapTestToPayload(test, 'build-1', null, baseOptions);
    expect(p.status).toBe('RERUN_PASS');
    expect(p.is_rerun).toBe(true);
  });

  it('retry>0 + failed → FAIL, is_rerun=true', () => {
    const test = makeMochaTest({ state: 'failed', currentRetry: 1 });
    const p = mapTestToPayload(test, 'build-1', null, baseOptions);
    expect(p.status).toBe('FAIL');
    expect(p.is_rerun).toBe(true);
  });

  it('sets failure payload when test.err present', () => {
    const err = new Error('assertion failed');
    err.stack = 'Error: assertion failed\n  at Context.<anonymous>';
    const test = makeMochaTest({ state: 'failed', err });
    const p = mapTestToPayload(test, 'build-1', null, baseOptions);
    expect(p.failure).toBeDefined();
    expect(p.failure!.error_message).toBe('assertion failed');
    expect(p.failure!.stack_trace).toContain('assertion failed');
  });

  it('no failure payload on passed test', () => {
    const test = makeMochaTest({ state: 'passed' });
    const p = mapTestToPayload(test, 'build-1', null, baseOptions);
    expect(p.failure).toBeUndefined();
  });

  it('info.file is basename of test.file', () => {
    const test = makeMochaTest({ file: '/project/tests/auth.spec.js' });
    const p = mapTestToPayload(test, 'build-1', null, baseOptions);
    expect(p.info!.file).toBe('auth.spec.js');
  });

  it('info.path is relative directory of test.file', () => {
    const test = makeMochaTest({ file: `${process.cwd()}/tests/auth.spec.js` });
    const p = mapTestToPayload(test, 'build-1', null, baseOptions);
    expect(p.info!.path).toBe('tests');
  });

  it('extracts @word tags from fullTitle', () => {
    const test = makeMochaTest({ fullTitle: 'Suite @smoke @regression test name' });
    const p = mapTestToPayload(test, 'build-1', null, baseOptions);
    expect(p.info!.tags).toContain('smoke');
    expect(p.info!.tags).toContain('regression');
  });

  it('merges meta tags with title tags', () => {
    const test = makeMochaTest({ fullTitle: 'Suite @smoke test' });
    const meta: UReportMeta = { tags: ['regression'] };
    const p = mapTestToPayload(test, 'build-1', meta, baseOptions);
    expect(p.info!.tags).toContain('smoke');
    expect(p.info!.tags).toContain('regression');
  });

  it('meta components merged into info', () => {
    const test = makeMochaTest({});
    const meta: UReportMeta = { components: ['Auth', 'API'] };
    const p = mapTestToPayload(test, 'build-1', meta, baseOptions);
    expect(p.info!.components).toEqual(['Auth', 'API']);
  });

  it('meta teams merged into info', () => {
    const test = makeMochaTest({});
    const meta: UReportMeta = { teams: ['backend'] };
    const p = mapTestToPayload(test, 'build-1', meta, baseOptions);
    expect(p.info!.teams).toEqual(['backend']);
  });

  it('custom meta fields stored in info', () => {
    const test = makeMochaTest({});
    const meta: UReportMeta = { jira: 'PROJ-123', owner: 'alice' };
    const p = mapTestToPayload(test, 'build-1', meta, baseOptions);
    expect((p.info as Record<string, unknown>)['jira']).toBe('PROJ-123');
    expect((p.info as Record<string, unknown>)['owner']).toBe('alice');
  });

  it('info.duration is a human-readable string', () => {
    const test = makeMochaTest({ duration: 1500 });
    const p = mapTestToPayload(test, 'build-1', null, baseOptions);
    expect(p.info!.duration).toBe('1.5s');
  });
});

describe('mapToRelationPayload', () => {
  it('maps standard fields correctly', () => {
    const test = makeMochaTest({
      fullTitle: 'Suite test',
      file: '/project/tests/auth.spec.js',
    });
    const payload = mapTestToPayload(test, 'build-1', { uid: 'TC-001' }, baseOptions);
    const relation = mapToRelationPayload(payload, baseOptions);

    expect(relation.uid).toBe('TC-001');
    expect(relation.product).toBe('TestProduct');
    expect(relation.type).toBe('unit');
    expect(relation.file).toBe('auth.spec.js');
  });

  it('extra meta keys go into customs', () => {
    const test = makeMochaTest({});
    const meta: UReportMeta = { jira: 'PROJ-456', owner: 'bob' };
    const payload = mapTestToPayload(test, 'build-1', meta, baseOptions);
    const relation = mapToRelationPayload(payload, baseOptions);

    expect(relation.customs).toBeDefined();
    expect(relation.customs!['jira']).toBe('PROJ-456');
    expect(relation.customs!['owner']).toBe('bob');
  });

  it('no customs when meta has no extra keys', () => {
    const test = makeMochaTest({});
    const meta: UReportMeta = { uid: 'TC-002', tags: ['smoke'] };
    const payload = mapTestToPayload(test, 'build-1', meta, baseOptions);
    const relation = mapToRelationPayload(payload, baseOptions);
    // duration is filtered by RELATION_INFO_KEYS so customs should be empty
    expect(relation.customs).toBeUndefined();
  });
});
