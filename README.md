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

### Mocha — `.mocharc.js`

```javascript
module.exports = {
  reporter: 'ureport-mocha-reporter',
  reporterOptions: {
    serverUrl: 'https://ureport.example.com',  // your UReport server
    apiToken: 'your-api-token',
    product: 'my-app',   // product name in UReport (groups builds together)
    type: 'unit',        // test type: unit | e2e | integration | etc.
  },
};
```

### Cypress — `cypress.config.js`

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

### CLI

```bash
npx mocha \
  --reporter ureport-mocha-reporter \
  --reporter-options "serverUrl=https://ureport.example.com,apiToken=xxx,product=my-app,type=unit" \
  tests/**/*.spec.js
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
| any other key | `unknown` | Stored in relation `customs` (e.g. `jira`, `owner`) |

### Why set a `uid`?

UReport links results across builds by `uid`. If you rename a test title, UReport loses its history. A stable `uid` keeps the history intact regardless of title changes.

### Limitations

- `ureport()` does **not** work in Mocha `--parallel` mode (workers are separate processes).
- `ureport()` cannot be called from browser-side Cypress test code — use title tags instead.
- In Cypress, `test.file` is not set by Mocha for browser-side specs, so `info.file` and `info.path` will be empty strings in the submitted payload.

## Options

| Option | Required | Default | Description |
|---|---|---|---|
| `serverUrl` | ✅ | — | UReport server base URL |
| `apiToken` | ✅ | — | API authentication token |
| `product` | ✅ | — | Product name (groups builds in UReport) |
| `type` | ✅ | — | Test type: `unit`, `e2e`, `integration`, etc. |
| `buildNumber` | | `Date.now()` | Build number (use CI build number for traceability) |
| `team` | | — | Team that owns this build |
| `browser` | | — | Browser name (e.g. `chrome`) |
| `device` | | — | Device name |
| `platform` | | auto-detected | OS platform (`linux`, `darwin`, `win32`) |
| `platform_version` | | auto-detected | OS kernel version |
| `stage` | | — | Deployment stage (`staging`, `prod`, etc.) |
| `version` | | — | App version being tested |
| `batchSize` | | `50` | Max tests per API call |
| `saveRelations` | | `true` | Whether to save test relations after each run |
| `autoDetectPlatform` | | `true` | Auto-detect `platform` and `platform_version` from OS |
| `outputFile` | | — | Path to write full run payload as JSON (useful for debugging) |

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
