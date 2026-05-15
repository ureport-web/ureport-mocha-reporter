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
  for (const field of REQUIRED_FIELDS) {
    if (!options[field]) {
      throw new Error(`[ureport-mocha-reporter] Missing required option: "${field}"`);
    }
  }

  return {
    ...DEFAULT_OPTIONS,
    ...options,
    buildNumber: options.buildNumber ?? Date.now(),
    // Coerce string booleans from Mocha CLI reporter-options parsing
    saveRelations: coerceBool(options.saveRelations, DEFAULT_OPTIONS.saveRelations),
    autoDetectPlatform: coerceBool(options.autoDetectPlatform, DEFAULT_OPTIONS.autoDetectPlatform),
  } as UReportMochaReporterOptions;
}
