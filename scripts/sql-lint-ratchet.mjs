#!/usr/bin/env node
/**
 * sql-lint-ratchet.mjs
 *
 * review-gate.yml's `sqlfluff` job used to lint only the files changed in a
 * PR, and its lint step ended in `|| true` — so the job could never fail,
 * regardless of what it found. It was listed in the `all` required
 * aggregate anyway, meaning it "gated" nothing while looking like a real
 * check. Measured 2026-08-19: 7,659 violations across
 * supabase/migrations/*.sql + supabase/seed/*.sql (264 of 303 files; 18
 * oversized files are skipped by sqlfluff's own byte-limit safety, not by
 * this script).
 *
 * That backlog is too large to unmask as a hard "zero violations" gate
 * without a repo-wide SQL reformat nobody asked for. Instead this mirrors
 * lint-ratchet.mjs's shape: lint the FULL scope (not just the PR's changed
 * files — a per-rule count only means something as a stable baseline if the
 * scope it's measured over doesn't shift under it), tally violations
 * per-rule, and fail only if any rule's count goes UP versus
 * .sqlfluff-baseline.json. Existing violations are grandfathered; new ones
 * block.
 *
 * Exit codes:
 *   0 — no regression (every rule's count <= baseline)
 *   1 — regression detected (at least one rule's count > baseline)
 *
 * Flags:
 *   --update  Rewrite .sqlfluff-baseline.json from the current run and exit 0.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(ROOT, '.sqlfluff-baseline.json');

const UPDATE = process.argv.includes('--update');

// ---------------------------------------------------------------------------
// 1. Resolve the file scope (same two directories the old job scoped to,
//    just not restricted to the PR's changed files — both are flat, single-
//    level directories today, so a plain readdir covers the same glob the
//    job used without adding a glob dependency).
// ---------------------------------------------------------------------------
function sqlFilesIn(dir) {
  const abs = resolve(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => join(dir, e.name));
}

const files = [...sqlFilesIn('supabase/migrations'), ...sqlFilesIn('supabase/seed')].sort();

if (files.length === 0) {
  console.log('sql-lint-ratchet: no SQL files found in scope — nothing to lint.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. Run sqlfluff and collect per-rule violation counts
// ---------------------------------------------------------------------------
let output;
try {
  // sqlfluff exits non-zero when it finds violations; stdout still has the
  // full report in that case, so treat that the same as a clean exit below.
  output = execFileSync(
    'sqlfluff',
    ['lint', '--dialect', 'postgres', '--rules', 'core', ...files],
    { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }
  );
} catch (err) {
  output = err.stdout || '';
  if (!output) {
    console.error('sql-lint-ratchet: sqlfluff produced no output and failed to run.');
    console.error(err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 2b. Report scope honestly. sqlfluff silently SKIPS any file over its own
// large_file_skip_byte_limit (20KB) rather than lint it — those files are
// NOT covered by this ratchet's count, and a silent scope reduction would
// read as "N violations under control" when it might mean "we stopped
// looking at some files." Always print which files that is, every run.
// ---------------------------------------------------------------------------
const SKIP_WARNING_RE = /^WARNING\s+Length of file '([^']+)' is \d+ bytes which is over the limit/;
const skippedFiles = [];
for (const line of output.split('\n')) {
  const m = SKIP_WARNING_RE.exec(line);
  if (m) skippedFiles.push(m[1]);
}
if (skippedFiles.length > 0) {
  console.log(
    `sql-lint-ratchet: NOT COVERED — sqlfluff's own 20KB large-file limit skipped ${skippedFiles.length} of ${files.length} in-scope file${files.length !== 1 ? 's' : ''}:`
  );
  for (const f of skippedFiles) console.log(`  - ${f}`);
} else {
  console.log(`sql-lint-ratchet: full coverage — all ${files.length} in-scope files linted, none skipped.`);
}

/** @type {Record<string, number>} */
const current = {};
let totalNow = 0;
// Violation lines look like: "L:  25 | P:   1 | LT05 | Line is too long ..."
const VIOLATION_RE = /^\s*L:\s*\d+\s*\|\s*P:\s*\d+\s*\|\s*([A-Z]{2}\d{2})\s*\|/;
for (const line of output.split('\n')) {
  const m = VIOLATION_RE.exec(line);
  if (m) {
    const rule = m[1];
    current[rule] = (current[rule] ?? 0) + 1;
    totalNow += 1;
  }
}

const sortedCurrent = Object.fromEntries(
  Object.entries(current).sort(([a], [b]) => a.localeCompare(b))
);

// ---------------------------------------------------------------------------
// 3. --update: overwrite baseline and exit
// ---------------------------------------------------------------------------
if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(sortedCurrent, null, 2) + '\n', 'utf-8');
  console.log(
    `sql-lint-ratchet: baseline updated — ${totalNow} violation${totalNow !== 1 ? 's' : ''} across ${Object.keys(sortedCurrent).length} rule${Object.keys(sortedCurrent).length !== 1 ? 's' : ''} locked in ${BASELINE_PATH}`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 4. Load baseline
// ---------------------------------------------------------------------------
/** @type {Record<string, number>} */
let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
} catch {
  console.error(
    `sql-lint-ratchet: baseline file not found at ${BASELINE_PATH}.\n` +
      'Run `npm run sql:ratchet -- --update` to create it.'
  );
  process.exit(1);
}

const totalBaseline = Object.values(baseline).reduce((s, n) => s + n, 0);

// ---------------------------------------------------------------------------
// 5. Per-rule comparison
// ---------------------------------------------------------------------------
/** @type {Array<{rule: string, baseline: number, now: number, delta: number}>} */
const regressions = [];
for (const [rule, nowCount] of Object.entries(current)) {
  const baseCount = baseline[rule] ?? 0;
  if (nowCount > baseCount) {
    regressions.push({ rule, baseline: baseCount, now: nowCount, delta: nowCount - baseCount });
  }
}

// ---------------------------------------------------------------------------
// 6. Report
// ---------------------------------------------------------------------------
if (regressions.length > 0) {
  console.error('sql-lint-ratchet: VIOLATION COUNT REGRESSION DETECTED\n');
  console.error(
    'The following sqlfluff rules have MORE violations than the baseline.\n' +
      'Fix the new violations, or run `npm run sql:ratchet -- --update` only\n' +
      'after the net violation count has decreased.\n'
  );

  const maxRuleLen = Math.max(...regressions.map((r) => r.rule.length));
  console.error(
    `  ${'Rule'.padEnd(maxRuleLen)}  ${'Baseline'.padStart(8)}  ${'Now'.padStart(8)}  ${'Delta'.padStart(6)}`
  );
  console.error(`  ${'-'.repeat(maxRuleLen + 28)}`);

  for (const { rule, baseline: b, now, delta } of regressions.sort(
    (a, b_) => b_.delta - a.delta
  )) {
    console.error(
      `  ${rule.padEnd(maxRuleLen)}  ${String(b).padStart(8)}  ${String(now).padStart(8)}  +${String(delta).padStart(5)}`
    );
  }

  console.error(`\n  Total: ${totalBaseline} → ${totalNow} (net ${totalNow >= totalBaseline ? '+' : ''}${totalNow - totalBaseline})`);
  process.exit(1);
}

if (totalNow < totalBaseline) {
  console.log(
    `sql-lint-ratchet: violations dropped (${totalBaseline} → ${totalNow}) — run \`npm run sql:ratchet -- --update\` to lock in the gains`
  );
} else {
  console.log(`sql-lint-ratchet: OK — ${totalNow} violation${totalNow !== 1 ? 's' : ''}, no regressions`);
}

process.exit(0);
