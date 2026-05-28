import { basename, relative, dirname } from 'path';
import { release } from 'os';
import type Mocha from 'mocha';
import type { UReportTestPayload, UReportTestRelationPayload, UReportTestInfo, UReportStatus, UReportStep } from './types.js';
import type { UReportMochaReporterOptions } from './config.js';
import type { UReportMeta } from './helper.js';

export function detectPlatformVersion(): string {
  return release();
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1_000).toFixed(1)}s`;
  }
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function mapStatus(
  state: string | undefined,
  currentRetry: number,
): UReportStatus {
  if (state === 'passed') {
    return currentRetry > 0 ? 'RERUN_PASS' : 'PASS';
  }
  if (state === 'failed') {
    return 'FAIL';
  }
  // pending, skipped, undefined
  return 'SKIP';
}

/**
 * Maps a Mocha Test to a UReport test payload.
 *
 * Mocha Test fields used:
 *   test.fullTitle()   — full path "suite > nested > test name"
 *   test.title         — leaf test name only
 *   test.file          — absolute file path (may be undefined in Cypress)
 *   test.duration      — ms (set after test end)
 *   test.err           — Error object if failed
 *   test.state         — 'passed' | 'failed' | 'pending' | undefined
 *   test.currentRetry() — 0-based retry count
 */
export function mapTestToPayload(
  test: Mocha.Test,
  buildId: string,
  meta: UReportMeta | null,
  options: UReportMochaReporterOptions,
): UReportTestPayload {
  const endTime = new Date();
  const durationMs = test.duration ?? 0;
  const startTime = new Date(endTime.getTime() - durationMs);

  const fullTitle = test.fullTitle();
  const uid = (meta?.uid as string | undefined) ?? fullTitle;

  const currentRetry = (test as unknown as { currentRetry(): number }).currentRetry();
  const status = mapStatus(test.state, currentRetry);
  const is_rerun = currentRetry > 0;

  // Extract @tag tokens from full title
  const titleTags = fullTitle.match(/@\w+/g)?.map((t) => t.slice(1)) ?? [];

  const testFile = (test as unknown as { file?: string }).file;
  const fileBasename = testFile ? basename(testFile) : '';
  const filePath = testFile ? relative(process.cwd(), dirname(testFile)) : '';

  const info: UReportTestInfo = {
    file: fileBasename,
    path: filePath,
    duration: formatDuration(durationMs),
  };

  // Merge title tags with meta tags
  const allTags = [...titleTags, ...(Array.isArray(meta?.tags) ? (meta.tags as string[]) : [])];
  if (allTags.length > 0) info.tags = allTags;

  const RESERVED_META_KEYS = new Set(['uid', 'tags', 'components', 'teams', 'steps', 'setup', 'teardown']);
  const quickInfoSet = new Set(options.quickInfoAnnotations ?? []);

  if (meta) {
    if (Array.isArray(meta.components) && (meta.components as string[]).length > 0) {
      info.components = meta.components as string[];
    }
    if (Array.isArray(meta.teams) && (meta.teams as string[]).length > 0) {
      info.teams = meta.teams as string[];
    }
    // Custom fields go into info, except:
    //   - reserved keys (uid/tags/components/teams/steps/setup/teardown)
    //   - quickInfo keys → collected into info.quickInfo as [{key, value}]
    for (const [key, value] of Object.entries(meta)) {
      if (RESERVED_META_KEYS.has(key)) continue;
      if (quickInfoSet.has(key)) {
        const existing = (info.quickInfo as Array<{ key: string; value: string }> | undefined) ?? [];
        info.quickInfo = [...existing, { key, value: String(value) }];
      } else {
        info[key] = value;
      }
    }
  }

  const payload: UReportTestPayload = {
    uid,
    name: fullTitle,
    build: buildId,
    status,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    is_rerun,
    info,
  };

  if (test.state === 'failed' && test.err) {
    payload.failure = {
      error_message: test.err.message ?? String(test.err),
      stack_trace: test.err.stack,
    };
  }

  if (Array.isArray(meta?.steps) && (meta!.steps as UReportStep[]).length > 0) {
    payload.body = meta!.steps as UReportStep[];
  }
  if (Array.isArray(meta?.setup) && (meta!.setup as UReportStep[]).length > 0) {
    payload.setup = meta!.setup as UReportStep[];
  }
  if (Array.isArray(meta?.teardown) && (meta!.teardown as UReportStep[]).length > 0) {
    payload.teardown = meta!.teardown as UReportStep[];
  }

  return payload;
}

// Keys on info that map to dedicated relation fields — not put into customs.
const RELATION_INFO_KEYS = new Set(['file', 'path', 'tags', 'components', 'teams', 'duration', 'quickInfo']);

export function mapToRelationPayload(
  test: UReportTestPayload,
  options: UReportMochaReporterOptions,
): UReportTestRelationPayload {
  const relation: UReportTestRelationPayload = {
    uid: test.uid,
    product: options.product,
    type: options.type,
  };

  const info = (test.info ?? {}) as UReportTestInfo;

  if (info.file) relation.file = info.file as string;
  if (info.path !== undefined) relation.path = info.path as string;
  if ((info.tags as string[] | undefined)?.length) relation.tags = info.tags as string[];
  if ((info.components as string[] | undefined)?.length) relation.components = info.components as string[];
  if ((info.teams as string[] | undefined)?.length) relation.teams = info.teams as string[];

  const customs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(info)) {
    if (!RELATION_INFO_KEYS.has(key)) {
      customs[key] = value;
    }
  }
  if (Object.keys(customs).length > 0) relation.customs = customs;

  return relation;
}
