import * as fs from 'fs';
import Mocha from 'mocha';
import { validateOptions } from './config.js';
import type { UReportMochaReporterOptions } from './config.js';
import { UReportApiClient } from './api-client.js';
import { _consumeMeta } from './helper.js';
import { mapTestToPayload, mapToRelationPayload, detectPlatformVersion } from './mapper.js';
import type { UReportTestPayload, UReportBuildPayload, UReportTestRelationPayload } from './types.js';

interface TestAttempt {
  test: Mocha.Test;
  meta: ReturnType<typeof _consumeMeta>;
}

export class UReportMochaReporter extends Mocha.reporters.Base {
  private options!: UReportMochaReporterOptions;
  private client!: UReportApiClient;
  private buildId = '';
  private buildPayload!: UReportBuildPayload;
  private attempts: TestAttempt[] = [];
  private collectedRelations: UReportTestRelationPayload[] = [];
  // Store the createBuild promise so the 'end' handler can await it (race condition prevention)
  private buildPromise: Promise<void> = Promise.resolve();

  constructor(
    runner: Mocha.Runner,
    options: { reporterOptions?: Partial<UReportMochaReporterOptions> },
  ) {
    super(runner, options);

    try {
      this.options = validateOptions(options.reporterOptions ?? {});
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return;
    }

    if (this.options.autoDetectPlatform !== false) {
      if (!this.options.platform) this.options.platform = process.platform;
      if (!this.options.platform_version) this.options.platform_version = detectPlatformVersion();
    }

    this.client = new UReportApiClient(this.options.serverUrl, this.options.apiToken);

    runner.on('start', () => {
      const rawBuild = this.options.buildNumber;
      const buildNumber =
        typeof rawBuild === 'number' ? rawBuild : parseInt(String(rawBuild), 10) || Date.now();

      this.buildPayload = {
        product: this.options.product,
        type: this.options.type,
        build: buildNumber,
        team: this.options.team,
        browser: this.options.browser,
        device: this.options.device,
        platform: this.options.platform,
        platform_version: this.options.platform_version,
        stage: this.options.stage,
        version: this.options.version,
        start_time: new Date().toISOString(),
      };

      this.buildPromise = this.client.createBuild(this.buildPayload).then((build) => {
        this.buildId = build._id;
      }).catch((err) => {
        console.error(
          `[ureport-mocha-reporter] Failed to create build: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    });

    runner.on('test end', (test: Mocha.Test) => {
      // Consume meta set by ureport() in the test body (cleared after each read)
      const meta = _consumeMeta();
      this.attempts.push({ test, meta });
    });

    runner.on('end', async () => {
      // Await the build creation in case it started but hasn't resolved yet
      await this.buildPromise;
      if (!this.buildId) return;

      try {
        const batchSize = Number(this.options.batchSize ?? 50);

        // Map all attempts to payloads
        const allPayloads: UReportTestPayload[] = this.attempts.map(({ test, meta }) =>
          mapTestToPayload(test, this.buildId, meta, this.options)
        );

        // Submit in batches
        for (let i = 0; i < allPayloads.length; i += batchSize) {
          const batch = allPayloads.slice(i, i + batchSize);
          await this.client.submitTests(batch);
        }

        await this.client.finalizeBuild(this.buildId);

        if (this.options.saveRelations !== false) {
          const seen = new Set<string>();
          for (const payload of allPayloads) {
            if (seen.has(payload.uid)) continue;
            seen.add(payload.uid);
            const relation = mapToRelationPayload(payload, this.options);
            this.collectedRelations.push(relation);
            await this.client.saveTestRelation(relation);
          }
        }

        const pass = allPayloads.filter((t) => t.status === 'PASS' || t.status === 'RERUN_PASS').length;
        const fail = allPayloads.filter((t) => t.status === 'FAIL').length;
        const skip = allPayloads.filter((t) => t.status === 'SKIP').length;

        console.log(
          `[ureport-mocha-reporter] Build ${this.buildId} finalized — PASS: ${pass}, FAIL: ${fail}, SKIP: ${skip}`
        );

        if (this.options.outputFile) {
          const output = JSON.stringify(
            { build: this.buildPayload, tests: allPayloads, relations: this.collectedRelations },
            null,
            2,
          );
          fs.writeFileSync(this.options.outputFile, output, 'utf-8');
          console.log(`[ureport-mocha-reporter] Payload saved to ${this.options.outputFile}`);
        }
      } catch (err) {
        console.error(
          `[ureport-mocha-reporter] Error during finalization: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  }
}
