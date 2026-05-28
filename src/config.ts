export interface UReportMochaReporterOptions {
  // Required
  serverUrl: string;
  apiToken: string;
  product: string;
  type: string;
  // Optional build metadata
  buildNumber?: string | number;
  team?: string;
  browser?: string;
  device?: string;
  platform?: string;
  platform_version?: string;
  stage?: string;
  version?: string;
  // Behavior
  batchSize?: number;
  saveRelations?: boolean;
  autoDetectPlatform?: boolean;
  outputFile?: string;
  /** Keys passed to ureport() that should be stored as info.quickInfo entries
   *  instead of scalar info fields. Excluded from relation customs. */
  quickInfoAnnotations?: string[];
}

export const DEFAULT_OPTIONS = {
  batchSize: 50,
  saveRelations: true,
  autoDetectPlatform: true,
} as const;

const REQUIRED_FIELDS: (keyof UReportMochaReporterOptions)[] = [
  'serverUrl',
  'apiToken',
  'product',
  'type',
];

function coerceBool(value: unknown, defaultVal: boolean): boolean {
  if (value === undefined || value === null) return defaultVal;
  if (typeof value === 'boolean') return value;
  if (value === 'false' || value === '0') return false;
  return Boolean(value);
}

export function validateOptions(options: Partial<UReportMochaReporterOptions>): UReportMochaReporterOptions {
  // Merge env vars as fallback for required fields.
  // This handles two cases:
  //   1. User prefers env vars (CI-friendly, no mocharc needed for secrets)
  //   2. Mocha coerces reporter-option objects to {"[object Object]":true} when
  //      the config file uses an object literal — env vars recover the required fields.
  const merged: Partial<UReportMochaReporterOptions> = {
    serverUrl: process.env['UREPORT_SERVER_URL'],
    apiToken:  process.env['UREPORT_API_TOKEN'],
    product:   process.env['UREPORT_PRODUCT'],
    type:      process.env['UREPORT_TYPE'],
    ...options,
  };

  for (const field of REQUIRED_FIELDS) {
    if (!merged[field]) {
      throw new Error(`[ureport-mocha-reporter] Missing required option: "${field}"`);
    }
  }

  return {
    ...DEFAULT_OPTIONS,
    ...merged,
    buildNumber: options.buildNumber ?? Date.now(),
    // Coerce string booleans from Mocha CLI reporter-options parsing
    saveRelations: coerceBool(options.saveRelations, DEFAULT_OPTIONS.saveRelations),
    autoDetectPlatform: coerceBool(options.autoDetectPlatform, DEFAULT_OPTIONS.autoDetectPlatform),
  } as UReportMochaReporterOptions;
}
