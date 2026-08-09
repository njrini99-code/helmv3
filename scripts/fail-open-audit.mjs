#!/usr/bin/env node
/**
 * fail-open-audit.mjs — ratchet for helm/no-empty-collection-on-error.
 *
 * WHAT THIS COUNTS, AND WHAT IT DOES NOT CLAIM
 *
 * The count is a CENSUS of a shape, not a bug count. Returning an empty
 * collection from an error branch is sometimes exactly right — see
 * lib/baseball/player-visibility.ts, where the author wrote down why a
 * side-query failing must not disable the caller's other filters. That one is
 * a considered decision and it logs.
 *
 * The shape is worth counting anyway, because when it is WRONG it is invisible:
 * the value that means "the read failed" is the same value that means "allow".
 * Three of those shipped in this codebase — Compare's privacy filter, the class
 * -schedule owner index, and addSecondTeam's duplicate-gender guard — and none
 * of them was findable by the unchecked-read ratchet, because all three bound
 * their error correctly and then answered it permissively.
 *
 * So: the number may never go UP. New code cannot add one silently. Paying one
 * down means either fixing it or marking it deliberate with an
 * eslint-disable and a reason — both of which turn an accident into a choice.
 *
 *   npm run audit:fail-open             # check (exit 1 on regression)
 *   npm run audit:fail-open -- --update # re-baseline
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = resolve(ROOT, '.fail-open-baseline.json');
const RULE = 'helm/no-empty-collection-on-error';
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
  console.error('fail-open-audit: could not parse ESLint JSON. Aborting rather than reporting a false 0.');
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

// Same false-zero guard as the sibling audit: a 0 against a non-zero baseline
// is far more likely to be a rule that failed to load than a repo that fixed
// every instance.
if (total === 0 && !UPDATE && existsSync(BASELINE_PATH)) {
  const prior = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).total ?? 0;
  if (prior > 0) {
    console.error(
      `fail-open-audit: found 0 but the baseline is ${prior}. That is far more likely to be a rule ` +
        'that failed to load than a repo that fixed them all. Failing loudly.',
    );
    process.exit(1);
  }
}

const top = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`empty-collection-on-error: ${total}`);
for (const [area, n] of top) console.log(`  ${String(n).padStart(4)}  ${area}`);

if (UPDATE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ total, byArea: Object.fromEntries(top) }, null, 2)}\n`);
  console.log(`\nbaseline updated → ${total}`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error('fail-open-audit: no baseline. Run with --update to create one.');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).total ?? 0;

if (total < baseline) {
  console.error(
    `\nSLACK: ${total} against a baseline of ${baseline}. Lock the paydown in:\n` +
      '  npm run audit:fail-open -- --update\n' +
      'and commit .fail-open-baseline.json alongside the fix.',
  );
  process.exit(1);
}

if (total > baseline) {
  console.error(
    `\nREGRESSION: ${total} empty-collection-on-error sites, baseline is ${baseline}.\n` +
      'A guard that answers a FAILED READ with the same value that means "allow" cannot be\n' +
      'told apart from permission — not by the code, and not by the person reading it.\n' +
      'Return null (or throw) so the caller decides, or add an eslint-disable saying why\n' +
      'empty is genuinely right here.',
  );
  process.exit(1);
}

console.log(`\nOK — baseline ${baseline}, no regression.`);
