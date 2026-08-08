#!/usr/bin/env node
/**
 * supabase-error-audit.mjs — ratchet for helm/no-unchecked-supabase-error.
 *
 * WHY THIS IS A SEPARATE SCRIPT AND NOT JUST A LINT RULE
 *
 * `npm run lint` runs with --max-warnings 0 and is a hard CI gate, and the
 * rule currently finds 1,111 call sites. Turning it on in the shared config
 * would fail the Lint job on every PR in the repo. How much of that debt to
 * service, and when, is a product decision — not something to slip in with a
 * bug fix. So the rule is registered but "off" there, and enforced here.
 *
 * WHAT THIS ENFORCES
 *
 * The count may never go UP. New code cannot add an unchecked Supabase read.
 * The existing debt can be paid down directory by directory, lowering the
 * baseline as it goes. When it reaches 0, flip the rule to "warn" in
 * eslint.config.mjs and delete this script.
 *
 *   npm run audit:supabase-errors            # check (exit 1 on regression)
 *   npm run audit:supabase-errors -- --update # re-baseline after paying down
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = resolve(ROOT, '.supabase-error-baseline.json');
const RULE = 'helm/no-unchecked-supabase-error';
const UPDATE = process.argv.includes('--update');

// Force the rule on for this run only; the shared config leaves it off.
let raw = '';
try {
  raw = execFileSync(
    'npx',
    ['eslint', 'src', '--format', 'json', '--max-warnings', '999999', '--rule', `{"${RULE}":"warn"}`],
    { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  );
} catch (err) {
  // ESLint exits non-zero when it reports anything, but still writes JSON.
  raw = (err.stdout || '').trim();
}

let results;
try {
  results = JSON.parse(raw);
} catch {
  console.error('supabase-error-audit: could not parse ESLint JSON output. Aborting rather than reporting a false 0.');
  process.exit(1);
}

const byArea = new Map();
let total = 0;
for (const file of results) {
  for (const msg of file.messages) {
    if (msg.ruleId !== RULE) continue;
    total += 1;
    const rel = file.filePath.split('/src/')[1] ?? file.filePath;
    const area = rel.split('/').slice(0, 3).join('/');
    byArea.set(area, (byArea.get(area) ?? 0) + 1);
  }
}

// A zero here almost certainly means the rule failed to load, not that the
// codebase is clean — treat it as a broken audit rather than a passing one.
if (total === 0 && !UPDATE && existsSync(BASELINE_PATH)) {
  const prior = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).total ?? 0;
  if (prior > 0) {
    console.error(
      `supabase-error-audit: found 0 violations but the baseline is ${prior}. ` +
        'That is far more likely to be a rule/config that failed to load than a repo that fixed 1,000 call sites. Failing loudly.',
    );
    process.exit(1);
  }
}

const top = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`unchecked Supabase reads: ${total}`);
for (const [area, n] of top) console.log(`  ${String(n).padStart(5)}  ${area}`);

if (UPDATE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ total, byArea: Object.fromEntries(top) }, null, 2)}\n`);
  console.log(`\nbaseline updated → ${total}`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error('supabase-error-audit: no baseline. Run with --update to create one.');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).total ?? 0;

// SLACK IS AN ERROR, not a pass.
//
// A ratchet that only watches the number RISE cannot see fixes disappearing
// underneath a baseline that sits above the real count. That is not
// hypothetical: on 2026-08-07, PR #1326 reverted four files and put six
// unchecked reads back. The count went 1098 -> 1104 against a baseline of
// 1107, so this script said "no regression" and the revert went unnoticed
// until it was found by hand.
//
// Every gap between baseline and reality is room for a fix to be silently
// undone. So a paydown must lock itself in: fix reads, run --update, commit
// the new number in the same change.
if (total < baseline) {
  console.error(
    `\nSLACK: ${total} unchecked Supabase reads against a baseline of ${baseline}.\n` +
      `That ${baseline - total}-read gap is room for a fix to be reverted without this script noticing —\n` +
      'which is exactly how #1326 undid four files unseen. Lock the paydown in:\n' +
      '  npm run audit:supabase-errors -- --update\n' +
      'and commit .supabase-error-baseline.json alongside the fix.',
  );
  process.exit(1);
}

if (total > baseline) {
  console.error(
    `\nREGRESSION: ${total} unchecked Supabase reads, baseline is ${baseline}.\n` +
      'A read that fails must not render as a read that found nothing — supabase-js resolves\n' +
      'errors as { data: null, error } rather than throwing, so `const { data } = await ...`\n' +
      'turns an outage into "no team", "no entries yet", a 404, or a leaderboard with no scores.\n' +
      'Bind `error` and decide explicitly: throw, log, or degrade.',
  );
  process.exit(1);
}

console.log(`\nOK — baseline ${baseline}, no regression.`);
