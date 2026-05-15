import { validateOptions, DEFAULT_OPTIONS } from '../src/config.js';

describe('validateOptions', () => {
  const base = {
    serverUrl: 'http://localhost:3000',
    apiToken: 'token123',
    product: 'MyApp',
    type: 'unit',
  };

  it('throws with [ureport-mocha-reporter] prefix when serverUrl missing', () => {
    expect(() => validateOptions({ ...base, serverUrl: '' })).toThrow(
      '[ureport-mocha-reporter] Missing required option: "serverUrl"'
    );
  });

  it('throws when apiToken missing', () => {
    expect(() => validateOptions({ ...base, apiToken: '' })).toThrow(
      '[ureport-mocha-reporter] Missing required option: "apiToken"'
    );
  });

  it('throws when product missing', () => {
    expect(() => validateOptions({ ...base, product: '' })).toThrow(
      '[ureport-mocha-reporter] Missing required option: "product"'
    );
  });

  it('throws when type missing', () => {
    expect(() => validateOptions({ ...base, type: '' })).toThrow(
      '[ureport-mocha-reporter] Missing required option: "type"'
    );
  });

  it('returns merged options with defaults when all required fields present', () => {
    const result = validateOptions(base);
    expect(result.serverUrl).toBe(base.serverUrl);
    expect(result.apiToken).toBe(base.apiToken);
    expect(result.product).toBe(base.product);
    expect(result.type).toBe(base.type);
    expect(result.batchSize).toBe(DEFAULT_OPTIONS.batchSize);
    expect(result.saveRelations).toBe(DEFAULT_OPTIONS.saveRelations);
    expect(result.autoDetectPlatform).toBe(DEFAULT_OPTIONS.autoDetectPlatform);
  });

  it('defaults buildNumber to a recent timestamp when absent', () => {
    const before = Date.now();
    const result = validateOptions(base);
    const after = Date.now();
    const bn = result.buildNumber as number;
    expect(bn).toBeGreaterThanOrEqual(before);
    expect(bn).toBeLessThanOrEqual(after);
  });

  it('preserves explicit buildNumber', () => {
    const result = validateOptions({ ...base, buildNumber: 42 });
    expect(result.buildNumber).toBe(42);
  });

  it('batchSize defaults to 50', () => {
    expect(validateOptions(base).batchSize).toBe(50);
  });

  it('saveRelations defaults to true', () => {
    expect(validateOptions(base).saveRelations).toBe(true);
  });

  it('overrides defaults with explicit values', () => {
    const result = validateOptions({ ...base, batchSize: 10, saveRelations: false });
    expect(result.batchSize).toBe(10);
    expect(result.saveRelations).toBe(false);
  });
});
