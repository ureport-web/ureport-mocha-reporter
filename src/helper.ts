export interface UReportMeta {
  uid?: string;
  components?: string[];
  teams?: string[];
  tags?: string[];
  /** Steps to store as test body (equivalent to Playwright test.step()). */
  steps?: import('./types.js').UReportStep[];
  /** Steps from setup phase (equivalent to Playwright beforeEach hooks). */
  setup?: import('./types.js').UReportStep[];
  /** Steps from teardown phase (equivalent to Playwright afterEach hooks). */
  teardown?: import('./types.js').UReportStep[];
  [key: string]: unknown;
}

// globalThis key used to share pending meta across CJS/ESM module instances.
// When test files import via ESM and the reporter loads via CJS (or vice versa),
// they get separate module instances with separate variables. Using globalThis
// ensures both sides read/write the same location within the same process.
const _META_KEY = '__ureport_pending_meta__';

/**
 * Annotates the current Mocha test with UReport metadata (uid, components, teams, tags, custom fields).
 *
 * Call this inside a test body before assertions. Works correctly because Mocha
 * runs tests serially in the same process.
 *
 * NOTE: Does NOT work in Mocha --parallel mode (workers are separate processes).
 * NOTE: Cannot be called from browser-side Cypress test code.
 *
 * @example
 * it('user can log in', function() {
 *   ureport({ uid: 'auth-login-001', components: ['Auth'], tags: ['smoke'] });
 *   // ... assertions
 * });
 */
export function ureport(meta: UReportMeta): void {
  (globalThis as Record<string, unknown>)[_META_KEY] = meta;
}

/**
 * Internal — imported by reporter.ts only. Returns stored meta and clears it.
 */
export function _consumeMeta(): UReportMeta | null {
  const g = globalThis as Record<string, unknown>;
  const m = (g[_META_KEY] as UReportMeta | undefined) ?? null;
  g[_META_KEY] = null;
  return m;
}
