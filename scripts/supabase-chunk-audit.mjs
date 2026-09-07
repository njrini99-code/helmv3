#!/usr/bin/env node
/**
 * supabase-chunk-audit.mjs — ratchet for helm/no-unchunked-in-filter.
 *
 * Same shape as scripts/supabase-error-audit.mjs and the same reason for
 * existing as a standalone script rather than a hard lint rule: turning
 * `helm/no-unchunked-in-filter` on in the shared eslint config would fail
 * `npm run lint` (--max-warnings 0) on every existing `.in()` call site that
 * predates the rule. How much of that to fix, and when, is a decision this
 * script defers to a shrinking baseline rather than a red build today.
 *
 * WHAT IT ENFORCES
 *
 * The violation count may never go UP. New code cannot add an unchunked
 * `.in()` id filter. Existing call sites are paid down over time by running
 * with --update after fixing them.
 *
 *   node scripts/supabase-chunk-audit.mjs            # check (exit 1 on regression)
 *   node scripts/supabase-chunk-audit.mjs --update    # re-baseline after paying down
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = resolve(ROOT, '.supabase-chunk-baseline.json');
const RULE = 'helm/no-unchunked-in-filter';
const UPDATE = process.argv.includes('--update');

let raw = '';
try {
  raw = execFileSync(
    'npx',
    ['eslint', 'src', '--format', 'json', '--max-warnings', '999999', '--rule', `{"${RULE}":"warn"}`],
    { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  );
} catch (err) {
  raw = (err.stdout || '').trim();
}

let results;
try {
  results = JSON.parse(raw);
} catch {
  console.error('supabase-chunk-audit: could not parse ESLint JSON output. Aborting rather than reporting a false 0.');
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

// Same defensive check as supabase-error-audit.mjs: a 0 against a nonzero
// baseline is far more likely a broken rule load than a fixed codebase.
if (total === 0 && !UPDATE && existsSync(BASELINE_PATH)) {
  const prior = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).total ?? 0;
  if (prior > 0) {
    console.error(
      `supabase-chunk-audit: found 0 violations but the baseline is ${prior}. ` +
        'That is far more likely to be a rule/config that failed to load than a repo that fixed every call site. Failing loudly.',
    );
    process.exit(1);
  }
}

const top = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`unchunked .in() filters: ${total}`);
for (const [area, n] of top) console.log(`  ${String(n).padStart(5)}  ${area}`);

if (UPDATE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ total, byArea: Object.fromEntries(top) }, null, 2)}\n`);
  console.log(`\nbaseline updated -> ${total}`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error('supabase-chunk-audit: no baseline. Run with --update to create one.');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).total ?? 0;

if (total > baseline) {
  console.error(`\nREGRESSION: ${total} > baseline ${baseline}. New unchunked .in() filter(s) added.`);
  process.exit(1);
}
if (total < baseline) {
  console.error(
    `\nSLACK: ${total} < baseline ${baseline}. The baseline no longer reflects reality — ` +
      'run with --update to lower it and lock the improvement in.',
  );
  process.exit(1);
}
console.log(`\nOK: ${total} == baseline ${baseline}.`);
process.exit(0);
