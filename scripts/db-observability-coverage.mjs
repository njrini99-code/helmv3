#!/usr/bin/env node
/**
 * Coverage-matrix generator - brief 79.
 *
 * Writes `docs/observability/SUPABASE_COVERAGE_MATRIX.md` from detectors that
 * read the modules, never from the brief's intent. The generated file carries
 * no date and no commit SHA, so `--check` is a genuine idempotence test
 * rather than a diff against the clock.
 *
 * Usage:
 *   node scripts/db-observability-coverage.mjs           # regenerate
 *   node scripts/db-observability-coverage.mjs --check   # fail if stale
 *   node scripts/db-observability-coverage.mjs --json    # machine report
 *
 * Exit 0: written, or (with --check) already current.
 * Exit 1: --check found the file missing or out of date.
 *
 * Static and read-only: no network, no database.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OUTPUT_PATH, buildMatrix, renderReport } from './lib/db-observability-coverage.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const JSON_MODE = process.argv.includes('--json');

const target = join(REPO_ROOT, OUTPUT_PATH);
const rendered = renderReport();

if (JSON_MODE) {
  console.log(JSON.stringify({ output: OUTPUT_PATH, rows: buildMatrix() }, null, 2));
  process.exit(0);
}

if (CHECK) {
  if (!existsSync(target)) {
    console.error(`FAIL - ${OUTPUT_PATH} does not exist. Run: node scripts/db-observability-coverage.mjs`);
    process.exit(1);
  }
  const current = readFileSync(target, 'utf-8');
  if (current !== rendered) {
    console.error(`FAIL - ${OUTPUT_PATH} is out of date. Run: node scripts/db-observability-coverage.mjs`);
    process.exit(1);
  }
  console.log(`PASS - ${OUTPUT_PATH} is current.`);
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, rendered, 'utf-8');

const matrix = buildMatrix();
const counts = {};
for (const row of matrix) {
  for (const [column, value] of Object.entries(row.cells)) {
    if (column === 'Blind spot') continue;
    const key = String(value).startsWith('YES') ? 'YES' : String(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
}

console.log(`\nWrote ${OUTPUT_PATH} - ${matrix.length} rows.\n`);
for (const [value, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(value).padEnd(40)} ${n}`);
}
console.log('\nUNKNOWN is not NO, and NOT VERIFIED is not YES. The blind spots are the point.\n');
