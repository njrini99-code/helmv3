#!/usr/bin/env node
/**
 * healthy-on-error-audit.mjs — ratchet for helm/no-healthy-value-on-error.
 *
 * The sibling of fail-open-audit.mjs, and the same discipline: this is a
 * CENSUS of a shape, not a bug count. Answering a failed read with 0, false,
 * or 'ok' is occasionally right — a genuinely optional signal whose absence
 * really is benign.
 *
 * The shape is worth counting anyway, because when it is WRONG it is
 * invisible in the most expensive way: the value that means "nobody read
 * this" is the same value that means "this is fine", so it renders green.
 * Eight of those were found in the Supabase observability program on
 * 2026-09-03, and not one was findable by the unchecked-read ratchet or by
 * fail-open-audit — every one of them bound its error correctly, or had no
 * error to bind, and then answered healthily.
 *
 * So: the number may never go UP. New code cannot add one silently. Paying
 * one down means either fixing it or marking it deliberate with an
 * eslint-disable and a reason — both of which turn an accident into a choice.
 *
 *   npm run audit:healthy-on-error             # check (exit 1 on regression)
 *   npm run audit:healthy-on-error -- --update # re-baseline
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = resolve(ROOT, '.healthy-on-error-baseline.json');
const RULE = 'helm/no-healthy-value-on-error';
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
  console.error('healthy-on-error-audit: could not parse ESLint JSON. Aborting rather than reporting a false 0.');
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

// Same false-zero guard as the sibling audits: a 0 against a non-zero baseline
// is far more likely to be a rule that failed to load than a repo that fixed
// every instance.
if (total === 0 && !UPDATE && existsSync(BASELINE_PATH)) {
  const prior = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).total ?? 0;
  if (prior > 0) {
    console.error(
      `healthy-on-error-audit: found 0 but the baseline is ${prior}. That is far more likely to be a rule ` +
        'that failed to load than a repo that fixed them all. Failing loudly.',
    );
    process.exit(1);
  }
}

const top = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`healthy-value-on-error: ${total}`);
for (const [area, n] of top) console.log(`  ${String(n).padStart(4)}  ${area}`);

if (UPDATE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ total, byArea: Object.fromEntries(top) }, null, 2)}\n`);
  console.log(`\nbaseline updated → ${total}`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error('healthy-on-error-audit: no baseline. Run with --update to create one.');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).total ?? 0;

if (total < baseline) {
  console.error(
    `\nSLACK: ${total} against a baseline of ${baseline}. Lock the paydown in:\n` +
      '  npm run audit:healthy-on-error -- --update\n' +
      'and commit .healthy-on-error-baseline.json alongside the fix.',
  );
  process.exit(1);
}

if (total > baseline) {
  console.error(
    `\nREGRESSION: ${total} healthy-value-on-error sites, baseline is ${baseline}.\n` +
      'A surface that answers a FAILED READ with the same value that means "this is fine"\n' +
      'cannot be told apart from a good state — not by the code, not by the screen, and not\n' +
      'by the person on call. Return null, or an explicit unknown/blind/degraded state, so\n' +
      'the caller decides. If a health-shaped value is genuinely right, add an\n' +
      'eslint-disable saying why.',
  );
  process.exit(1);
}

console.log(`\nOK — baseline ${baseline}, no regression.`);
