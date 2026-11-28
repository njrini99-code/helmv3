#!/usr/bin/env node
/**
 * clubhouse:raw-values — the per-file ratchet behind the
 * helm/clubhouse-no-raw-value ESLint rule (dsx-09).
 *
 *   npm run clubhouse:raw-values             report counts against the baseline
 *   npm run clubhouse:raw-values -- --update rewrite the baseline; refuses to raise a count
 *
 * `npm run lint` already fails a file over its count (and one under it, so the
 * baseline is lowered with the fix). This script writes the baseline, and also
 * catches a baseline entry whose file is gone.
 */
import { ESLint } from 'eslint';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { BASELINE_FILE } from '../../eslint-rules/clubhouse-no-raw-value.mjs';

const ROOT = process.cwd();
const UPDATE = process.argv.includes('--update');
const ALLOW_RAISE = process.argv.includes('--first-baseline');

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfig: { rules: { 'helm/clubhouse-no-raw-value': ['error', { reportAll: true }] } },
});
const IS_OUT = /(^|\/)__tests__\/|\.test\.tsx?$|^src\/clubhouse\/preview\//;
const results = (await eslint.lintFiles(['src/clubhouse/**/*.{ts,tsx}'])).filter((r) => !IS_OUT.test(relative(ROOT, r.filePath).split(sep).join('/')));
const now = {};
const kinds = { colour: 0, size: 0, arbitrary: 0 };
for (const r of results) {
  const n = r.messages.filter((m) => m.ruleId === 'helm/clubhouse-no-raw-value');
  if (!n.length) continue;
  now[relative(ROOT, r.filePath).split(sep).join('/')] = n.length;
  for (const m of n) {
    const k = /^Colour/.test(m.message) ? 'colour' : /^Size/.test(m.message) ? 'size' : 'arbitrary';
    kinds[k] += 1;
  }
}
const path = join(ROOT, BASELINE_FILE);
const was = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).files ?? {} : {};
const sorted = Object.fromEntries(Object.entries(now).sort(([a], [b]) => a.localeCompare(b)));
const total = Object.values(now).reduce((a, b) => a + b, 0);

const raised = Object.entries(now).filter(([f, n]) => n > (was[f] ?? 0));
const stale = Object.keys(was).filter((f) => !(f in now));
const lower = Object.entries(was).filter(([f, n]) => f in now && now[f] < n);

if (UPDATE) {
  if (raised.length && !ALLOW_RAISE) {
    console.error('clubhouse:raw-values: refusing to raise a count. Fix these instead:');
    for (const [f, n] of raised) console.error(`  ${f}: ${n} (baseline ${was[f] ?? 0})`);
    process.exit(1);
  }
  const body = {
    note: 'Colour and size literals per Clubhouse module (helm/clubhouse-no-raw-value, dsx-09). Counts may only fall; lower with npm run clubhouse:raw-values -- --update.',
    total,
    kinds,
    files: sorted,
  };
  writeFileSync(path, JSON.stringify(body, null, 2) + '\n');
  console.log(`clubhouse:raw-values: baseline written, ${total} literal(s) in ${Object.keys(sorted).length} file(s) (${kinds.colour} colour, ${kinds.size} size, ${kinds.arbitrary} arbitrary class).`);
  process.exit(0);
}

let bad = 0;
for (const [f, n] of raised) { console.error(`  over: ${f} has ${n}, baseline ${was[f] ?? 0}`); bad++; }
for (const [f, n] of lower) { console.error(`  lower: ${f} has ${now[f]}, baseline ${n} (run --update)`); bad++; }
for (const f of stale) { console.error(`  stale: ${f} has none now (run --update)`); bad++; }
if (bad) { console.error(`clubhouse:raw-values: ${bad} file(s) off the baseline.`); process.exit(1); }
console.log(`clubhouse:raw-values: ${total} literal(s) in ${Object.keys(now).length} file(s), matching the baseline (${kinds.colour} colour, ${kinds.size} size, ${kinds.arbitrary} arbitrary class).`);
