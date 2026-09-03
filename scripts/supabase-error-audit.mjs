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

// -----------------------------------------------------------------------
// Phase 2 Track B addition — Auth/Storage/Realtime/Edge coverage inventory.
//
// REPORT-ONLY. Nothing below this line affects the exit code or the
// helm/no-unchecked-supabase-error ratchet above — that check keeps its
// exact prior behaviour (SLACK / REGRESSION / OK, still gated on
// BASELINE_PATH). This section exists so a coverage question ("which Auth
// call sites still have no observeAuthResult wired?") has one command to
// answer instead of four separate greps, and prints unconditionally
// regardless of which branch (--update / regression / slack / OK) the
// ratchet above takes.
//
// HOW "OBSERVED" IS DECIDED: file-level, not call-site-level. A real
// per-call-site answer needs an AST walk (does THIS specific `.channel(...)`
// chain feed into `observeRealtimeChannel`); this is deliberately a cheaper,
// coarser heuristic — a file that calls a raw Supabase surface AND also
// imports the matching observe* wrapper is reported OBSERVED, otherwise
// UNOBSERVED. A file can import the wrapper for one call site and still
// leave another one in the same file bare; this heuristic will not catch
// that. It is a starting point for the coverage audit brief §49-55 asks
// for, not a certification.
//
// `.auth.` is DELIBERATELY THE BRIEF'S OWN GREP TARGET, not narrowed to
// `supabase.auth.` — which means it also matches non-Supabase `.auth.`
// property access (a false-positive risk the brief's own wording accepts
// for this report-only pass; narrow it before ever gating on this count).
// -----------------------------------------------------------------------

/** Runs `grep -rn -F <pattern> src --include=*.ts --include=*.tsx`, returns
 *  `{ file, lineNo, text }` rows. Exit code 1 (grep's "no matches") is not
 *  an error here — it means zero call sites, a valid and common result. */
function grepCallSites(pattern) {
  try {
    const raw = execFileSync(
      'grep',
      ['-rn', '-F', '--include=*.ts', '--include=*.tsx', pattern, 'src'],
      { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
    );
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const firstColon = line.indexOf(':');
        const secondColon = line.indexOf(':', firstColon + 1);
        if (firstColon < 0 || secondColon < 0) return null;
        return {
          file: line.slice(0, firstColon),
          lineNo: line.slice(firstColon + 1, secondColon),
          text: line.slice(secondColon + 1).trim(),
        };
      })
      .filter((row) => row !== null)
      // Drop the obvious comment/JSDoc noise (this script's own new files,
      // and any future doc comment mentioning the pattern in prose) —
      // best-effort, not exhaustive.
      .filter((row) => !row.text.startsWith('//') && !row.text.startsWith('*') && !row.text.startsWith('/**'));
  } catch (err) {
    if (err.status === 1) return [];
    throw err;
  }
}

/** True when `file` (relative to repo root, as grep reports it) imports
 *  ANY of `wrapperNames` somewhere in its own text — the file-level
 *  "observed" heuristic described above. Cached per (file) since the same
 *  file is checked once per call site it contains. */
const fileTextCache = new Map();
function fileImportsAnyOf(file, wrapperNames) {
  if (!fileTextCache.has(file)) {
    try {
      fileTextCache.set(file, readFileSync(resolve(ROOT, file), 'utf-8'));
    } catch {
      fileTextCache.set(file, '');
    }
  }
  const text = fileTextCache.get(file);
  return wrapperNames.some((name) => text.includes(name));
}

function reportCoverage(label, pattern, wrapperNames) {
  const sites = grepCallSites(pattern);
  let observed = 0;
  let unobserved = 0;
  const unobservedFiles = new Set();
  for (const site of sites) {
    if (fileImportsAnyOf(site.file, wrapperNames)) {
      observed += 1;
    } else {
      unobserved += 1;
      unobservedFiles.add(site.file);
    }
  }
  console.log(`\n${label}: ${sites.length} call site(s) matching ${JSON.stringify(pattern)}`);
  console.log(`  observed (file imports ${wrapperNames.join(' or ')}): ${observed}`);
  console.log(`  unobserved: ${unobserved}`);
  if (unobservedFiles.size > 0) {
    const shown = [...unobservedFiles].sort().slice(0, 15);
    for (const f of shown) console.log(`    - ${f}`);
    if (unobservedFiles.size > shown.length) {
      console.log(`    ... and ${unobservedFiles.size - shown.length} more file(s)`);
    }
  }
  return { label, total: sites.length, observed, unobserved };
}

console.log('\n--- Auth / Storage / Realtime / Edge coverage (report-only, Phase 2 Track B) ---');
reportCoverage('Auth (.auth.)', '.auth.', ['observeAuthResult']);
reportCoverage('Storage (storage.from()', 'storage.from(', ['observeStorageResult']);
reportCoverage('Realtime (.channel())', '.channel(', ['observeRealtimeChannel']);
reportCoverage('Realtime (.subscribe())', '.subscribe(', ['observeRealtimeChannel']);
reportCoverage('Edge Functions (functions.invoke())', 'functions.invoke(', ['observeEdgeInvoke']);

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
