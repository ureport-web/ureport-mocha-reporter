export interface UReportMeta {
  uid?: string;
  components?: string[];
  teams?: string[];
  tags?: string[];
  [key: string]: unknown;
}

let _pendingMeta: UReportMeta | null = null;

/**
 * Annotates the current Mocha test with UReport metadata (uid, components, teams, tags, custom fields).
 *
 * Call this inside a test body before assertions. Uses a module-level variable — works correctly
 * because Mocha runs tests serially in the same process.
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
  _pendingMeta = meta;
}

/**
 * Internal — imported by reporter.ts only. Returns stored meta and clears it.
 */
export function _consumeMeta(): UReportMeta | null {
  const m = _pendingMeta;
  _pendingMeta = null;
  return m;
}
