# ureport-mocha-reporter

Mocha reporter plugin for UReport — automatically ships test results to your UReport server after each run. Works with Mocha directly and with Cypress (which uses Mocha internally).

## Requirements

- Node.js >= 18 (uses native `fetch`)
- Mocha >= 8.0.0

## Installation

```bash
npm install --save-dev ureport-mocha-reporter
```

## Quick start

### Mocha — env vars (recommended)

Set required config as environment variables — ideal for CI and keeps secrets out of config files:

```bash
export UREPORT_SERVER_URL=https://ureport.example.com
export UREPORT_API_TOKEN=your-api-token
export UREPORT_PRODUCT=my-app
export UREPORT_TYPE=unit
```

Then in `.mocharc.js`:

```javascript
module.exports = {
  reporter: 'ureport-mocha-reporter',
};
```

> **Note:** Mocha's `.mocharc.js` `reporterOptions` object is not supported — Mocha coerces
> it to a string internally, losing all keys. Use env vars or the CLI string format instead.
>
> If you need to configure non-required options (team, browser, stage, etc.) from a config file
> rather than env vars, use the setup file + wrapper pattern:
>
> **`ureport-setup.js`** (in your project root):
> ```js
> global.__ureportConfig = {
>   serverUrl: process.env.UREPORT_SERVER_URL,
>   apiToken: process.env.UREPORT_API_TOKEN,
>   product: 'my-app',
>   type: 'unit',
>   team: 'backend',
>   stage: 'staging',
>   saveRelations: true,
> };
> ```
>
> **`ureport-reporter.js`** (in your project root):
> ```js
> const UReportMochaReporter = require('ureport-mocha-reporter');
> class UReportWrapper extends UReportMochaReporter {
>   constructor(runner, options) {
>     super(runner, { ...options, reporterOptions: global.__ureportConfig ?? {} });
>   }
> }
> module.exports = UReportWrapper;
> ```
>
> **`.mocharc.js`**:
> ```js
> module.exports = {
>   require: ['./ureport-setup.js'],
>   reporter: './ureport-reporter.js',
> };
> ```

### Mocha — CLI string format

```bash
npx mocha \
  --reporter ureport-mocha-reporter \
  --reporter-options "serverUrl=https://ureport.example.com,apiToken=xxx,product=my-app,type=unit" \
  tests/**/*.spec.js
```

### Cypress — `cypress.config.js`

Cypress handles `reporterOptions` itself (bypasses Mocha's coercion), so object config works:

```javascript
module.exports = {
  reporter: 'ureport-mocha-reporter',
  reporterOptions: {
    serverUrl: 'https://ureport.example.com',
    apiToken: 'your-api-token',
    product: 'my-app',
    type: 'e2e',
  },
};
```

That's it — every run creates a build in UReport and submits all test results automatically.

## Annotating tests with `ureport()`

Annotation is **optional**. Without it, the reporter still submits every test result using the full test title as the uid.

Call `ureport()` inside a test body to attach richer metadata:

```javascript
const { ureport } = require('ureport-mocha-reporter');

it('user can log in', function() {
  ureport({
    uid: 'auth-login-001',       // stable identifier — survives title renames
    components: ['Auth', 'API'],  // components under test
    teams: ['backend'],           // owning team
    tags: ['smoke'],              // custom tags
    jira: 'AUTH-123',            // any extra field → stored in relation customs
  });
  // ... assertions
});
```

Tags can also come from `@word` tokens in the test title — no `ureport()` call needed:

```javascript
it('login flow @smoke @regression', () => { /* ... */ });
```

**`ureport()` fields:**

| Field | Type | Description |
|---|---|---|
| `uid` | `string` | Stable test ID. Defaults to full test title if omitted. |
| `components` | `string[]` | Components under test |
| `teams` | `string[]` | Owning teams |
| `tags` | `string[]` | Custom tags (merged with title tags) |
| `steps` | `UReportStep[]` | Body steps (see [Steps](#steps)) |
| `setup` | `UReportStep[]` | Setup phase steps |
| `teardown` | `UReportStep[]` | Teardown phase steps |
| any other key | `unknown` | Stored in relation `customs` (e.g. `jira`, `owner`), or in `info.quickInfo` if key is listed in `quickInfoAnnotations` |

### Why set a `uid`?

UReport links results across builds by `uid`. If you rename a test title, UReport loses its history. A stable `uid` keeps the history intact regardless of title changes.

### Steps

Mocha has no native step API, but you can attach step data via `ureport()`. Steps are stored in UReport the same way as Playwright steps.

```javascript
const { ureport } = require('ureport-mocha-reporter');

it('place order flow', function() {
  ureport({
    setup: [
      { detail: 'seed test user', status: 'PASS' },
    ],
    steps: [
      { detail: 'add item to cart', status: 'PASS' },
      {
        detail: 'submit order',
        status: 'PASS',
        attachment: { 'content-type': 'json', content: JSON.stringify({ orderId: 42 }) },
      },
      {
        detail: 'outer step',
        status: 'PASS',
        steps: [
          { detail: 'inner step A', status: 'PASS' },
          { detail: 'inner step B', status: 'PASS' },
        ],
      },
    ],
    teardown: [
      { detail: 'delete test user', status: 'PASS' },
    ],
  });
  // ... assertions
});
```

**`UReportStep` shape:**

| Field | Type | Required | Description |
|---|---|---|---|
| `detail` | `string` | ✅ | Step label |
| `status` | `'PASS' \| 'FAIL'` | ✅ | Step outcome |
| `steps` | `UReportStep[]` | | Nested child steps |
| `attachment` | `{ 'content-type': 'json' \| 'text', content: string }` | | Attached payload |

### QuickInfo annotations

Some fields (e.g. CI build URL, environment name) are useful for display in UReport but should not pollute relation `customs`. List them in `quickInfoAnnotations` — they are stored as `info.quickInfo: [{key, value}]` instead.

Reporter config:
```js
global.__ureportConfig = {
  // ...
  quickInfoAnnotations: ['env', 'build_url'],
};
```

Test:
```javascript
it('checkout flow', function() {
  ureport({ env: 'staging', build_url: 'https://ci.example.com/build/456' });
  // ...
});
```

Result in UReport: `info.quickInfo = [{ key: 'env', value: 'staging' }, { key: 'build_url', value: '...' }]`. These do **not** appear in `info.env` or relation `customs`.

### Limitations

- `ureport()` does **not** work in Mocha `--parallel` mode (workers are separate processes).
- `ureport()` cannot be called from browser-side Cypress test code — use title tags instead.
- In Cypress, `test.file` is not set by Mocha for browser-side specs, so `info.file` and `info.path` will be empty strings in the submitted payload.

## Options

Required options can be set via env vars as a fallback: `UREPORT_SERVER_URL`, `UREPORT_API_TOKEN`, `UREPORT_PRODUCT`, `UREPORT_TYPE`.

| Option | Env var | Required | Default | Description |
|---|---|---|---|---|
| `serverUrl` | `UREPORT_SERVER_URL` | ✅ | — | UReport server base URL |
| `apiToken` | `UREPORT_API_TOKEN` | ✅ | — | API authentication token |
| `product` | `UREPORT_PRODUCT` | ✅ | — | Product name (groups builds in UReport) |
| `type` | `UREPORT_TYPE` | ✅ | — | Test type: `unit`, `e2e`, `integration`, etc. |
| `buildNumber` | | | `Date.now()` | Build number (use CI build number for traceability) |
| `team` | | | — | Team that owns this build |
| `browser` | | | — | Browser name (e.g. `chrome`) |
| `device` | | | — | Device name |
| `platform` | | | auto-detected | OS platform (`linux`, `darwin`, `win32`) |
| `platform_version` | | | auto-detected | OS kernel version |
| `stage` | | | — | Deployment stage (`staging`, `prod`, etc.) |
| `version` | | | — | App version being tested |
| `batchSize` | | | `50` | Max tests per API call |
| `saveRelations` | | | `true` | Whether to save test relations after each run |
| `autoDetectPlatform` | | | `true` | Auto-detect `platform` and `platform_version` from OS |
| `quickInfoAnnotations` | | | `[]` | Keys from `ureport()` to store as `info.quickInfo` entries instead of scalar fields |
| `outputFile` | | | — | Path to write full run payload as JSON (useful for debugging) |

## Relations

Relations are how UReport tracks test metadata (uid, components, ownership) independently of test results. The reporter saves one relation per unique uid automatically after each run — no setup needed beyond using `ureport()`.

**What gets saved per relation:**

| Field | Source |
|---|---|
| `uid` | `ureport({ uid })` or full test title fallback |
| `product` / `type` | reporter options |
| `file` / `path` | test file location (relative to cwd) |
| `tags` | `ureport({ tags })` + `@word` tokens extracted from title |
| `components` | `ureport({ components })` |
| `teams` | `ureport({ teams })` |
| `customs` | any extra keys in `ureport({})` (e.g. `jira`, `owner`) |

Relations are deduplicated by uid — only the first occurrence per run is saved. Retries do not create duplicate relations.

Disable with `saveRelations: false` if you manage relations separately.

## Retry handling

Mocha fires `test end` **once per test** — after the final retry attempt. Status reflects the final outcome:

| Final result | `retry` | Status | `is_rerun` |
|---|---|---|---|
| passed | 0 | `PASS` | `false` |
| passed | > 0 | `RERUN_PASS` | `true` |
| failed | 0 | `FAIL` | `false` |
| failed | > 0 | `FAIL` | `true` |
| pending | — | `SKIP` | `false` |

A `RERUN_PASS` means the test was flaky — it failed on earlier attempts but passed on the final one.
