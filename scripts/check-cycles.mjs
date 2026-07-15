#!/usr/bin/env node
/**
 * check-cycles.mjs
 *
 * Runs madge (config in .madgerc skips `import type` edges — those are
 * erased at compile time and cannot cause runtime TDZ crashes) via its Node
 * API — not `npx`/the CLI — and compares the RUNTIME import cycles it finds
 * against .cycles-baseline.json.
 *
 * Why the Node API instead of shelling out to the CLI:
 *   - `npx madge` can silently fetch an unpinned copy of the package instead
 *     of using the one `npm ci` already installed; importing the local
 *     dependency fails loudly if it's ever missing.
 *   - The madge CLI only prints `--warning` (skipped/unresolved file) output
 *     when NOT combined with `--json` (see bin/cli.js), so a JSON-mode CLI
 *     invocation can never see which files it failed to resolve. The API's
 *     `res.warnings().skipped` has no such restriction.
 *
 * Why this exists: two production crashes (PR #803 golf CoachHelm, PR #804
 * baseball roster) came from value-level import cycles that typecheck and
 * build cleanly but throw "Cannot access X before initialization" at cold
 * runtime, depending on bundler eval order. This ratchet blocks NEW cycles
 * while tolerating the pre-existing set until it is paid down.
 *
 * Skipped files: madge drops any import it can't resolve to a file (missing
 * package, bad path, tsconfig mapping gap) from the graph entirely, so a
 * cycle that depends on a resolution edge into one of those files can go
 * undetected. This repo legitimately has one such entry today — `server-only`
 * is a bare npm specifier that Next.js aliases to a built-in shim at build
 * time (next/dist/compiled/server-only) without it ever being an installed
 * package, so madge (which knows nothing of that webpack alias) can never
 * resolve it. Rather than hard-failing on that permanent, benign case, the
 * skipped-file list is ratcheted exactly like cycles are: tolerate the known
 * baseline, fail on anything new.
 *
 * Exit codes:
 *   0 — no new cycles and no new skipped files (current sets ⊆ baseline)
 *   1 — at least one new cycle or newly-skipped file not present in the baseline
 *
 * Flags:
 *   --update  Rewrite .cycles-baseline.json from the current run and exit 0.
 */

import madge from 'madge';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(ROOT, '.cycles-baseline.json');
const MADGERC_PATH = resolve(ROOT, '.madgerc');

const UPDATE = process.argv.includes('--update');

// ---------------------------------------------------------------------------
// 1. Run madge (in-process) and collect cycles + skipped files
// ---------------------------------------------------------------------------
let madgeConfig;
try {
  madgeConfig = JSON.parse(readFileSync(MADGERC_PATH, 'utf-8'));
} catch (err) {
  console.error(`check-cycles: could not read/parse ${MADGERC_PATH}: ${err.message}`);
  process.exit(1);
}
// Resolve to an absolute path so this doesn't depend on the invoking cwd —
// the old CLI invocation pinned `cwd: ROOT` for the same reason.
if (typeof madgeConfig.tsConfig === 'string') {
  madgeConfig.tsConfig = resolve(ROOT, madgeConfig.tsConfig);
}

let madgeResult;
try {
  madgeResult = await madge(resolve(ROOT, 'src'), madgeConfig);
} catch (err) {
  console.error('check-cycles: madge failed to build the dependency graph.');
  console.error(err.message);
  process.exit(1);
}

const skipped = [...madgeResult.warnings().skipped].sort();

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

const current = [...new Set(madgeResult.circular().map(canonicalize))].sort();

// ---------------------------------------------------------------------------
// 2. --update: overwrite baseline and exit
// ---------------------------------------------------------------------------
if (UPDATE) {
  console.log(`check-cycles: updating baseline at ${BASELINE_PATH}`);
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ skipped, cycles: current }, null, 2) + '\n',
    'utf-8'
  );
  console.log(
    `check-cycles: baseline updated — ${current.length} runtime cycle${current.length !== 1 ? 's' : ''}, ` +
      `${skipped.length} skipped file${skipped.length !== 1 ? 's' : ''} locked in`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 3. Load baseline and compare
// ---------------------------------------------------------------------------
/** @type {{ skipped: string[], cycles: string[] }} */
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

const baselineSkippedSet = new Set(baseline.skipped ?? []);
const newSkipped = skipped.filter((f) => !baselineSkippedSet.has(f));

const baselineSet = new Set(baseline.cycles ?? []);
const newCycles = current.filter((c) => !baselineSet.has(c));
const currentSet = new Set(current);
const resolvedCycles = (baseline.cycles ?? []).filter((c) => !currentSet.has(c));

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------
let failed = false;

if (newSkipped.length > 0) {
  failed = true;
  console.error('check-cycles: NEW UNRESOLVED FILE(S) DETECTED\n');
  console.error(
    'madge could not resolve the following file(s) it has not seen before.\n' +
      'A cycle that runs through one of these can silently disappear from the\n' +
      'graph below, so this fails closed instead of under-detecting. If this is\n' +
      'a known benign case (e.g. a bare npm specifier that a bundler aliases\n' +
      'without the package being installed), run `npm run check:cycles -- --update`\n' +
      'to accept it; otherwise fix the import path/extension/tsconfig mapping.\n'
  );
  for (const file of newSkipped) {
    console.error(`  ${file}`);
  }
}

if (newCycles.length > 0) {
  failed = true;
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
    `\n  ${newCycles.length} new cycle${newCycles.length !== 1 ? 's' : ''} (baseline ${baseline.cycles?.length ?? 0}, current ${current.length})`
  );
}

if (failed) {
  process.exit(1);
}

if (resolvedCycles.length > 0) {
  console.log(
    `check-cycles: ${resolvedCycles.length} baseline cycle${resolvedCycles.length !== 1 ? 's' : ''} resolved (${baseline.cycles?.length ?? 0} → ${current.length}) — run \`npm run check:cycles -- --update\` to lock in the gains`
  );
} else {
  console.log(`check-cycles: OK — ${current.length} known cycle${current.length !== 1 ? 's' : ''}, none new`);
}

process.exit(0);
