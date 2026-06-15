#!/usr/bin/env node
/**
 * lint-ratchet.mjs
 *
 * Runs `npx eslint src --format json`, tallies warnings per rule-id, and
 * compares them against .lint-baseline.json.
 *
 * Exit codes:
 *   0 — no regression (all rule counts <= baseline)
 *   1 — regression detected (at least one rule count > baseline)
 *
 * Flags:
 *   --update  Rewrite .lint-baseline.json from the current run and exit 0.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(ROOT, '.lint-baseline.json');

const UPDATE = process.argv.includes('--update');

// ---------------------------------------------------------------------------
// 1. Run ESLint and collect per-rule warning counts
// ---------------------------------------------------------------------------
let eslintOutput;
try {
  // execFileSync with an explicit argv array — no shell, no injection surface.
  // stderr → 'inherit' so deprecation notices print directly and don't
  // pollute the JSON stdout buffer we parse below.
  eslintOutput = execFileSync(
    'npx',
    ['eslint', 'src', '--format', 'json', '--max-warnings', '999999'],
    // maxBuffer: 64 MB — the full-repo JSON output is ~10 MB today and will
    // grow; 64 MB leaves ample headroom without meaningful memory cost.
    { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }
  );
} catch (err) {
  // eslint exits non-zero when warnings/errors are present, but still writes
  // valid JSON to stdout.  Use that if it looks like JSON.
  eslintOutput = (err.stdout || '').trim();
  if (!eslintOutput.startsWith('[')) {
    console.error('ESLint failed and did not produce JSON output.');
    console.error(err.message);
    process.exit(1);
  }
}

/** @type {Array<{messages: Array<{severity: number, ruleId: string|null}>}>} */
let files;
try {
  files = JSON.parse(eslintOutput);
} catch (parseErr) {
  console.error('Could not parse ESLint JSON output:', parseErr.message);
  process.exit(1);
}

/** @type {Record<string, number>} */
const current = {};
for (const file of files) {
  for (const msg of file.messages) {
    if (msg.severity === 1) {
      // severity 1 = warning; severity 2 = error
      const rule = msg.ruleId ?? '(null)';
      current[rule] = (current[rule] ?? 0) + 1;
    }
  }
}

// Stable sorted copy for writing / printing
const sortedCurrent = Object.fromEntries(
  Object.entries(current).sort(([a], [b]) => a.localeCompare(b))
);

const totalNow = Object.values(current).reduce((s, n) => s + n, 0);

// ---------------------------------------------------------------------------
// 2. --update: overwrite baseline and exit
// ---------------------------------------------------------------------------
if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(sortedCurrent, null, 2) + '\n', 'utf-8');
  console.log(
    `lint-ratchet: baseline updated — ${totalNow} warning${totalNow !== 1 ? 's' : ''} across ${Object.keys(sortedCurrent).length} rule${Object.keys(sortedCurrent).length !== 1 ? 's' : ''} locked in ${BASELINE_PATH}`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 3. Load baseline
// ---------------------------------------------------------------------------
/** @type {Record<string, number>} */
let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
} catch {
  console.error(
    `lint-ratchet: baseline file not found at ${BASELINE_PATH}.\n` +
      'Run `npm run lint:ratchet -- --update` to create it.'
  );
  process.exit(1);
}

const totalBaseline = Object.values(baseline).reduce((s, n) => s + n, 0);

// ---------------------------------------------------------------------------
// 4. Per-rule comparison
// ---------------------------------------------------------------------------
/** @type {Array<{rule: string, baseline: number, now: number, delta: number}>} */
const regressions = [];

// Check every rule that appears in current run
for (const [rule, nowCount] of Object.entries(current)) {
  const baseCount = baseline[rule] ?? 0;
  if (nowCount > baseCount) {
    regressions.push({ rule, baseline: baseCount, now: nowCount, delta: nowCount - baseCount });
  }
}

// Also check rules in baseline that have gone to 0 (not a regression, just informational)
// No action needed — fewer warnings are always fine.

// ---------------------------------------------------------------------------
// 5. Report
// ---------------------------------------------------------------------------
if (regressions.length > 0) {
  console.error('lint-ratchet: WARNING COUNT REGRESSION DETECTED\n');
  console.error(
    'The following rules have MORE warnings than the baseline.\n' +
      'Fix the new violations, or run `npm run lint:ratchet -- --update` only\n' +
      'after the net warning count has decreased.\n'
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
    `lint-ratchet: warnings dropped (${totalBaseline} → ${totalNow}) — run \`npm run lint:ratchet -- --update\` to lock in the gains`
  );
} else {
  // totalNow === totalBaseline (per-rule no regressions, same total)
  console.log(`lint-ratchet: OK — ${totalNow} warning${totalNow !== 1 ? 's' : ''}, no regressions`);
}

process.exit(0);
