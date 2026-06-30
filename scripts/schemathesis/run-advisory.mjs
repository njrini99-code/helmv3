#!/usr/bin/env node
/**
 * Advisory Schemathesis runner.
 * Runs property-based API fuzzing when an OpenAPI schema exists; otherwise
 * writes a skip report and exits 0 (advisory lane).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const outDir = join(process.cwd(), 'docs/operations/generated');
mkdirSync(outDir, { recursive: true });

const schemaCandidates = [
  join(process.cwd(), 'docs/openapi/openapi.json'),
  join(process.cwd(), 'docs/openapi/openapi.yaml'),
  join(process.cwd(), 'openapi.json'),
];

const schemaPath = schemaCandidates.find((p) => existsSync(p));
const targetUrl =
  process.env.SCHEMATHESIS_TARGET_URL?.trim() ||
  process.env.PLAYWRIGHT_BASE_URL?.trim() ||
  'http://localhost:3000';

function writeSkipReport(reason) {
  const report = {
    skipped: true,
    reason,
    schema_candidates: schemaCandidates,
    target_url: targetUrl,
    docs: 'docs/operations/BUG_DISCOVERY_STACK.md#schemathesis',
    generated_at: new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'schemathesis-report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`schemathesis: skipped — ${reason}\n`);
}

if (!schemaPath) {
  writeSkipReport('No OpenAPI schema found. Add docs/openapi/openapi.json to enable fuzzing.');
  process.exit(0);
}

const schemathesis = spawnSync(
  'schemathesis',
  ['run', schemaPath, '--base-url', targetUrl, '--checks', 'all', '--hypothesis-max-examples', '25'],
  { encoding: 'utf8', stdio: 'pipe' },
);

const report = {
  skipped: false,
  schema: schemaPath,
  target_url: targetUrl,
  exit_code: schemathesis.status ?? 1,
  stdout: schemathesis.stdout?.slice(-8000) ?? '',
  stderr: schemathesis.stderr?.slice(-8000) ?? '',
  generated_at: new Date().toISOString(),
};

writeFileSync(join(outDir, 'schemathesis-report.json'), JSON.stringify(report, null, 2));

if (schemathesis.status !== 0) {
  process.stderr.write(schemathesis.stderr ?? 'schemathesis failed\n');
  process.exit(schemathesis.status ?? 1);
}

process.stdout.write('schemathesis: completed\n');
