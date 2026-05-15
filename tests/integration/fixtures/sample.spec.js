const { ureport } = require('../../../dist/cjs/index.js');

describe('Suite', () => {
  it('passing test', () => {
    // Passes
  });

  it('failing test', () => {
    throw new Error('intentional failure');
  });

  it('skipped test');

  it('annotated uid test', () => {
    ureport({ uid: 'TC-CUSTOM-001' });
  });

  it('tagged via title @smoke', () => {
    // tag extracted from title
  });

  it('test with tags and components', () => {
    ureport({ tags: ['regression'], components: ['auth'], teams: ['backend'] });
  });

  it('custom relation test', () => {
    ureport({ jira: 'PROJ-123', owner: 'alice' });
  });
});
