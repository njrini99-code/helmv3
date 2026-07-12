#!/usr/bin/env node
/**
 * check-cycles.mjs
 *
 * Runs `npx madge --circular --json src` (config in .madgerc skips
 * `import type` edges — those are erased at compile time and cannot cause
 * runtime TDZ crashes) and compares the RUNTIME import cycles it finds
 * against .cycles-baseline.json.
 *
 * Why this exists: two production crashes (PR #803 golf CoachHelm, PR #804
 * baseball roster) came from value-level import cycles that typecheck and
 * build cleanly but throw "Cannot access X before initialization" at cold
 * runtime, depending on bundler eval order. This ratchet blocks NEW cycles
 * while tolerating the pre-existing set until it is paid down.
 *
 * Exit codes:
 *   0 — no new cycles (current set ⊆ baseline)
 *   1 — at least one cycle not present in the baseline
 *
 * Flags:
 *   --update  Rewrite .cycles-baseline.json from the current run and exit 0.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(ROOT, '.cycles-baseline.json');

const UPDATE = process.argv.includes('--update');

// ---------------------------------------------------------------------------
// 1. Run madge and collect cycles
// ---------------------------------------------------------------------------
let madgeOutput;
try {
  madgeOutput = execFileSync(
    'npx',
    ['madge', '--circular', '--json', 'src'],
    { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }
  );
} catch (err) {
  // madge exits 1 when cycles exist but still writes valid JSON to stdout.
  madgeOutput = (err.stdout || '').trim();
  if (!madgeOutput.startsWith('[')) {
    console.error('check-cycles: madge failed and did not produce JSON output.');
    console.error(err.message);
    process.exit(1);
  }
}

/** @type {string[][]} */
let rawCycles;
try {
  rawCycles = JSON.parse(madgeOutput);
} catch (parseErr) {
  console.error('check-cycles: could not parse madge JSON output:', parseErr.message);
  process.exit(1);
}

/**
 * Canonicalize a cycle so the same loop always serializes identically:
 * rotate the module list so the lexicographically smallest member comes
 * first (a cycle has no inherent start), then join with ' > '.
 * @param {string[]} cycle
 */
function canonicalize(cycle) {
  if (cycle.length === 0) return '';
  let minIdx = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[minIdx]) minIdx = i;
  }
  return [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)].join(' > ');
}

const current = [...new Set(rawCycles.map(canonicalize))].sort();

// ---------------------------------------------------------------------------
// 2. --update: overwrite baseline and exit
// ---------------------------------------------------------------------------
if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n', 'utf-8');
  console.log(
    `check-cycles: baseline updated — ${current.length} runtime cycle${current.length !== 1 ? 's' : ''} locked in ${BASELINE_PATH}`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 3. Load baseline and compare
// ---------------------------------------------------------------------------
/** @type {string[]} */
let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
} catch {
  console.error(
    `check-cycles: baseline file not found at ${BASELINE_PATH}.\n` +
      'Run `npm run check:cycles -- --update` to create it.'
  );
  process.exit(1);
}

const baselineSet = new Set(baseline);
const newCycles = current.filter((c) => !baselineSet.has(c));
const currentSet = new Set(current);
const resolved = baseline.filter((c) => !currentSet.has(c));

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------
if (newCycles.length > 0) {
  console.error('check-cycles: NEW RUNTIME IMPORT CYCLE DETECTED\n');
  console.error(
    'Value-level import cycles can crash at cold runtime with\n' +
      '"Cannot access X before initialization" even though typecheck and\n' +
      'build pass (see PRs #803/#804). Break the cycle — usually by moving\n' +
      'shared constants/helpers into a leaf module (e.g. roster-constants.ts)\n' +
      'or switching to `import type` where only types are needed.\n'
  );
  for (const cycle of newCycles) {
    console.error(`  ${cycle}`);
  }
  console.error(
    `\n  ${newCycles.length} new cycle${newCycles.length !== 1 ? 's' : ''} (baseline ${baseline.length}, current ${current.length})`
  );
  process.exit(1);
}

if (resolved.length > 0) {
  console.log(
    `check-cycles: ${resolved.length} baseline cycle${resolved.length !== 1 ? 's' : ''} resolved (${baseline.length} → ${current.length}) — run \`npm run check:cycles -- --update\` to lock in the gains`
  );
} else {
  console.log(`check-cycles: OK — ${current.length} known cycle${current.length !== 1 ? 's' : ''}, none new`);
}

process.exit(0);
