#!/usr/bin/env node
/**
 * Gate the weekly Stryker mutation run on its own reported score.
 *
 * WHY THIS EXISTS
 *
 * `.circleci/config.yml`'s `stryker-coachhelm` job ran `npx stryker run || true`
 * — the `|| true` swallows every exit code, including a crash, so a collapsing
 * mutation score (or a broken Stryker config) could never fail the weekly job.
 * Removing `|| true` alone is not sufficient: with no `thresholds.break` set in
 * `stryker.conf.json`, Stryker's OWN default is `break: null`, which exits 0 at
 * ANY score. This script is the actual gate — it reads Stryker's JSON report
 * directly, computes the mutation score from mutant status counts (not a
 * top-level field, which not every schema version populates), and fails the
 * process when the score is below a committed floor.
 *
 * WHY THE FLOOR IS A COMMITTED NUMBER, NOT A BASELINE FILE
 *
 * This repo's usual ratchet pattern (`.lint-baseline.json` etc.) works because
 * a human runs `--update` locally and commits the new baseline. The weekly
 * Stryker job runs on an ephemeral CircleCI container against a scheduled
 * pipeline — nothing in that job can commit a file back to the repo. A
 * "write the baseline on first run" design would therefore never persist:
 * every week would be treated as the first week, forever green. That is the
 * same failure class this file exists to close, in a new shape. The floor
 * lives in `config/mutation-gate.json`, committed in the same PR that removes
 * `|| true`, and is explicitly marked PROVISIONAL there — no real weekly
 * mutation score is recorded anywhere in this repo as of this change
 * (see docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md §0.10).
 * Tighten it by hand the first time a real weekly job log reports a score.
 *
 * EXIT SEMANTICS (matches scripts/control-plane-verify.mjs's convention)
 *
 *   0  PASS      score computed and >= floor
 *   1  FAIL      score computed and < floor — a real regression/collapse
 *   2  UNKNOWN   the report is missing, unparseable, or has zero valid
 *                mutants to score — never treated as a pass
 *
 * Usage:
 *   node scripts/mutation-gate.mjs [reportPath] [configPath]
 *   (defaults: reports/mutation/mutation.json, config/mutation-gate.json)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const UNKNOWN = 'UNKNOWN';

/**
 * Mutant statuses that count as "killed" (the test suite caught the mutant).
 * Matches Stryker's own published mutation-score formula:
 *   score = (Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage) * 100
 * Ignored, CompileError and RuntimeError mutants are excluded from both the
 * numerator and the denominator — they are not a statement about test
 * quality, they are invalid or intentionally-skipped mutations.
 */
const KILLED_STATUSES = new Set(['Killed', 'Timeout']);
const VALID_STATUSES = new Set(['Killed', 'Timeout', 'Survived', 'NoCoverage']);

/**
 * Parse a Stryker mutation-testing-report-schema JSON document and compute
 * the overall mutation score from mutant status counts across every file.
 *
 * Deliberately does NOT trust a top-level `mutationScore`/`thresholds` field —
 * not every schema version populates one at the root, and a gate whose number
 * silently depends on schema version is a gate that can silently stop working.
 * Computing from `files[*].mutants[*].status` is stable across versions.
 *
 * Returns { score, counts, totalValid, totalMutants } or throws if the shape
 * is not a Stryker report at all (caller maps that to UNKNOWN, not FAIL).
 */
export function computeMutationScore(report) {
  if (!report || typeof report !== 'object' || typeof report.files !== 'object' || report.files === null) {
    throw new Error('not a Stryker mutation report: missing "files" object');
  }

  const counts = Object.create(null);
  let totalMutants = 0;

  for (const file of Object.values(report.files)) {
    const mutants = Array.isArray(file?.mutants) ? file.mutants : [];
    for (const mutant of mutants) {
      const status = mutant?.status ?? 'Unknown';
      counts[status] = (counts[status] ?? 0) + 1;
      totalMutants += 1;
    }
  }

  const killed = [...KILLED_STATUSES].reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const totalValid = [...VALID_STATUSES].reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  if (totalValid === 0) {
    return { score: null, counts, totalValid, totalMutants };
  }

  const score = (killed / totalValid) * 100;
  return { score, counts, totalValid, totalMutants };
}

function loadJson(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} not found at ${path}`);
  }
  let raw;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    throw new Error(`${label} at ${path} could not be read: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label} at ${path} is not valid JSON: ${err.message}`);
  }
}

/**
 * Pure decision function so the CLI wrapper and tests share one path.
 * `reportPath`/`configPath` are read here (not injected as objects) so a
 * "file missing" failure is exercised the same way in tests as in CI.
 */
export function runGate({ reportPath, configPath }) {
  let config;
  try {
    config = loadJson(configPath, 'mutation-gate config');
  } catch (err) {
    return { verdict: UNKNOWN, message: err.message };
  }
  if (typeof config.floor !== 'number' || !Number.isFinite(config.floor)) {
    return { verdict: UNKNOWN, message: `mutation-gate config at ${configPath} has no numeric "floor"` };
  }

  let report;
  try {
    report = loadJson(reportPath, 'Stryker mutation report');
  } catch (err) {
    return { verdict: UNKNOWN, message: err.message };
  }

  let result;
  try {
    result = computeMutationScore(report);
  } catch (err) {
    return { verdict: UNKNOWN, message: `could not compute a score: ${err.message}` };
  }

  if (result.score === null) {
    return {
      verdict: UNKNOWN,
      message: `report at ${reportPath} has zero valid (Killed/Timeout/Survived/NoCoverage) mutants out of ${result.totalMutants} total — nothing to score. Check the "mutate" glob actually matched files.`,
      counts: result.counts,
    };
  }

  const verdict = result.score >= config.floor ? PASS : FAIL;
  return {
    verdict,
    score: result.score,
    floor: config.floor,
    counts: result.counts,
    totalValid: result.totalValid,
    totalMutants: result.totalMutants,
    message:
      verdict === PASS
        ? `mutation score ${result.score.toFixed(2)}% >= floor ${config.floor}%`
        : `mutation score ${result.score.toFixed(2)}% < floor ${config.floor}% — regression or genuine test-quality collapse`,
  };
}

function main() {
  const reportPath = resolve(ROOT, process.argv[2] || 'reports/mutation/mutation.json');
  const configPath = resolve(ROOT, process.argv[3] || 'config/mutation-gate.json');

  const result = runGate({ reportPath, configPath });

  console.log(`mutation-gate: ${result.verdict}`);
  console.log(result.message);
  if (result.counts) {
    console.log('mutant status counts:', JSON.stringify(result.counts));
  }
  if (typeof result.score === 'number') {
    console.log(`score=${result.score.toFixed(2)} floor=${result.floor} totalValid=${result.totalValid} totalMutants=${result.totalMutants}`);
  }

  if (result.verdict === PASS) process.exit(0);
  if (result.verdict === FAIL) process.exit(1);
  process.exit(2); // UNKNOWN
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
