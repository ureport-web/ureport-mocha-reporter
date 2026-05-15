let flakyAttempt = 0;
let alwaysFailAttempt = 0;

describe('Retries', () => {
  it('flaky test', function () {
    this.retries(1);
    if (flakyAttempt++ === 0) {
      throw new Error('Intentional first-attempt failure');
    }
  });

  it('always failing test', function () {
    this.retries(1);
    alwaysFailAttempt++;
    throw new Error('always fails');
  });
});
