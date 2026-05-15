import { ureport, _consumeMeta } from '../src/helper.js';

// Reset module state between tests
beforeEach(() => {
  // Drain any leftover meta from previous test
  _consumeMeta();
});

describe('ureport / _consumeMeta', () => {
  it('stores meta in module-level variable', () => {
    ureport({ uid: 'TC-001' });
    const m = _consumeMeta();
    expect(m).toEqual({ uid: 'TC-001' });
  });

  it('_consumeMeta clears state — returns null on second call', () => {
    ureport({ uid: 'TC-002' });
    _consumeMeta();
    expect(_consumeMeta()).toBeNull();
  });

  it('returns null when ureport() was never called', () => {
    expect(_consumeMeta()).toBeNull();
  });

  it('second ureport() call overwrites first (last-write wins)', () => {
    ureport({ uid: 'first' });
    ureport({ uid: 'second' });
    expect(_consumeMeta()?.uid).toBe('second');
  });

  it('stores meta with custom fields as-is', () => {
    ureport({ uid: 'TC-003', jira: 'PROJ-99', owner: 'alice', tags: ['smoke'] });
    const m = _consumeMeta();
    expect(m).toEqual({ uid: 'TC-003', jira: 'PROJ-99', owner: 'alice', tags: ['smoke'] });
  });
});
