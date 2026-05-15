import { EventEmitter } from 'events';
import type Mocha from 'mocha';
import type { UReportMochaReporterOptions } from '../src/config.js';

// Mock the API client
const mockCreateBuild = jest.fn();
const mockSubmitTests = jest.fn();
const mockFinalizeBuild = jest.fn();
const mockSaveTestRelation = jest.fn();

jest.mock('../src/api-client.js', () => ({
  UReportApiClient: jest.fn().mockImplementation(() => ({
    createBuild: mockCreateBuild,
    submitTests: mockSubmitTests,
    finalizeBuild: mockFinalizeBuild,
    saveTestRelation: mockSaveTestRelation,
  })),
}));

// Mock fs to capture outputFile writes
const mockWriteFileSync = jest.fn();
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: mockWriteFileSync,
}));

import { UReportMochaReporter } from '../src/reporter.js';

const baseReporterOptions: Partial<UReportMochaReporterOptions> = {
  serverUrl: 'http://localhost:3000',
  apiToken: 'test-token',
  product: 'TestProduct',
  type: 'unit',
  autoDetectPlatform: false,
};

function makeFakeRunner(): EventEmitter & { stats: Mocha.Stats } {
  const runner = new EventEmitter() as EventEmitter & { stats: Mocha.Stats };
  runner.stats = {} as Mocha.Stats;
  return runner;
}

function makeFakeTest(overrides: {
  fullTitle?: string;
  title?: string;
  file?: string;
  duration?: number;
  state?: 'passed' | 'failed' | 'pending';
  err?: Error;
  currentRetry?: number;
}): Mocha.Test {
  const {
    fullTitle = 'Suite test',
    title = 'test',
    file = '/project/tests/foo.spec.js',
    duration = 10,
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

async function runReporter(
  tests: Mocha.Test[],
  reporterOptions: Partial<UReportMochaReporterOptions> = baseReporterOptions,
): Promise<void> {
  mockCreateBuild.mockResolvedValue({ _id: 'build-abc' });
  mockSubmitTests.mockResolvedValue(undefined);
  mockFinalizeBuild.mockResolvedValue(undefined);
  mockSaveTestRelation.mockResolvedValue(undefined);

  const runner = makeFakeRunner();
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  new UReportMochaReporter(runner as unknown as Mocha.Runner, { reporterOptions });

  // Fire 'start' and wait for the async createBuild
  const startDone = new Promise<void>((resolve) => {
    mockCreateBuild.mockImplementationOnce(async () => {
      const result = { _id: 'build-abc' };
      resolve();
      return result;
    });
  });

  runner.emit('start');
  await startDone;

  // Fire test end events
  for (const test of tests) {
    runner.emit('test end', test);
  }

  // Fire 'end' and wait for finalization
  await new Promise<void>((resolve) => {
    mockFinalizeBuild.mockImplementationOnce(async () => {
      resolve();
    });
    runner.emit('end');
  });

  // Small tick to let remaining async operations settle
  await new Promise((r) => setImmediate(r));
}

describe('UReportMochaReporter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateBuild.mockResolvedValue({ _id: 'build-abc' });
    mockSubmitTests.mockResolvedValue(undefined);
    mockFinalizeBuild.mockResolvedValue(undefined);
    mockSaveTestRelation.mockResolvedValue(undefined);
  });

  it('start event → createBuild called with correct product/type', async () => {
    await runReporter([makeFakeTest({})]);
    expect(mockCreateBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'TestProduct',
        type: 'unit',
        start_time: expect.any(String),
      })
    );
  });

  it('end event → submitTests called with all collected tests', async () => {
    const tests = [makeFakeTest({ fullTitle: 'test 1' }), makeFakeTest({ fullTitle: 'test 2' })];
    await runReporter(tests);
    expect(mockSubmitTests).toHaveBeenCalled();
    const allSubmitted = mockSubmitTests.mock.calls.flatMap((c: [{ tests: Mocha.Test[] }]) => c[0].tests ?? c[0]);
    expect(allSubmitted).toHaveLength(2);
  });

  it('end event → finalizeBuild called with buildId', async () => {
    await runReporter([makeFakeTest({})]);
    expect(mockFinalizeBuild).toHaveBeenCalledWith('build-abc');
  });

  it('end event → saveTestRelation called once per unique uid', async () => {
    const tests = [
      makeFakeTest({ fullTitle: 'Suite test A', state: 'passed', currentRetry: 0 }),
      makeFakeTest({ fullTitle: 'Suite test B', state: 'passed', currentRetry: 0 }),
    ];
    await runReporter(tests);
    expect(mockSaveTestRelation).toHaveBeenCalledTimes(2);
  });

  it('saveRelations: false → no saveTestRelation calls', async () => {
    await runReporter(
      [makeFakeTest({})],
      { ...baseReporterOptions, saveRelations: false }
    );
    expect(mockSaveTestRelation).not.toHaveBeenCalled();
  });

  it('batchSize: 2 with 3 tests → 2 submitTests calls', async () => {
    const tests = [
      makeFakeTest({ fullTitle: 'test 1' }),
      makeFakeTest({ fullTitle: 'test 2' }),
      makeFakeTest({ fullTitle: 'test 3' }),
    ];
    await runReporter(tests, { ...baseReporterOptions, batchSize: 2 });
    expect(mockSubmitTests).toHaveBeenCalledTimes(2);
  });

  it('retry: FAIL attempt then RERUN_PASS → both payloads submitted', async () => {
    const failAttempt = makeFakeTest({ fullTitle: 'flaky test', state: 'failed', currentRetry: 0, err: new Error('fail') });
    const passAttempt = makeFakeTest({ fullTitle: 'flaky test', state: 'passed', currentRetry: 1 });

    await runReporter([failAttempt, passAttempt]);

    const allSubmitted: Array<{ status: string; is_rerun: boolean }> = mockSubmitTests.mock.calls
      .flatMap((c: unknown[]) => {
        const arg = c[0] as { tests?: Array<{ status: string; is_rerun: boolean }> } | Array<{ status: string; is_rerun: boolean }>;
        return Array.isArray(arg) ? arg : (arg.tests ?? []);
      });

    const fail = allSubmitted.find((t) => t.status === 'FAIL');
    const rerunPass = allSubmitted.find((t) => t.status === 'RERUN_PASS');
    expect(fail).toBeDefined();
    expect(fail!.is_rerun).toBe(false);
    expect(rerunPass).toBeDefined();
    expect(rerunPass!.is_rerun).toBe(true);
  });

  it('bad options (no serverUrl) → reporter does not throw, logs error gracefully', () => {
    const runner = makeFakeRunner();
    expect(() => {
      new UReportMochaReporter(runner as unknown as Mocha.Runner, {
        reporterOptions: { apiToken: 'x', product: 'P', type: 'unit' },
      });
    }).not.toThrow();
  });
});
