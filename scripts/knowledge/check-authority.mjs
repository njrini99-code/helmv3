#!/usr/bin/env node
/**
 * check-authority.mjs — the authority map must point at documents that exist,
 * are current, and say where they came from.
 *
 * WHAT THIS DOES NOT ATTEMPT
 *
 * Natural-language contradiction detection. This repo has already deleted one
 * guard for that class of error: a regex over prose refused an `echo`, a `grep`
 * and a commit message for containing the words of a blocked command. A
 * paragraph that says something false is not something a pattern can find, and
 * a checker that claims otherwise is worse than none, because a green run then
 * reads as "no contradictions".
 *
 * So the claims below are STRUCTURAL — a path resolves, a header names a
 * replacement, a generated file names its generator, nothing current routes to
 * something retired. The prose sweep at the end REPORTS and never fails: the
 * word "canonical" appearing twice is a prompt for a human, not a verdict.
 *
 * SCOPE IS CURRENT AUTHORITY ONLY
 *
 * Design specs and dated plans describe things that were never built —
 * `docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md` names a
 * `memory/ledgers/operations/` directory that has never existed, and that is
 * correct for a spec. Failing on it would make a clean baseline impossible and
 * force exactly the "baseline the contradiction away" move this exists to
 * prevent. Only documents something currently ROUTES to are held to resolve.
 *
 * Usage: node scripts/knowledge/check-authority.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';

const ROOT = process.cwd();
const P = (...p) => resolve(ROOT, ...p);

const problems = [];
const fail = (kind, detail) => problems.push({ kind, detail });

const tracked = new Set(
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf-8' }).trim().split('\n').filter(Boolean),
);

const head = (p) => {
  try {
    return readFileSync(P(p), 'utf-8').slice(0, 1500);
  } catch {
    return null;
  }
};
const retired = (p) => {
  const h = head(p);
  if (h === null) return null;
  if (/^STATUS:\s*SUPERSEDED/mi.test(h) || /\*\*Status:\*\*\s*SUPERSEDED/i.test(h)) return 'SUPERSEDED';
  if (/^STATUS:\s*HISTORICAL/mi.test(h)) return 'HISTORICAL';
  if (p.startsWith('docs/archive/') || p.startsWith('archive/')) return 'ARCHIVED';
  return null;
};

// ---------------------------------------------------------------------------
// 1. The navigation map's own table
// ---------------------------------------------------------------------------
const helmOs = readFileSync(P('docs/HELM_OS.md'), 'utf-8');
const mapRows = [...helmOs.matchAll(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/gm)]
  .filter(([, q]) => q.endsWith('?'))
  .map(([, question, authority]) => ({ question, authority }));

if (mapRows.length === 0) {
  fail('HELM_OS_TABLE_UNREADABLE', 'docs/HELM_OS.md has no question/authority rows — the map cannot be checked');
}
for (const row of mapRows) {
  for (const m of row.authority.matchAll(/`([^`]+)`/g)) {
    const path = m[1];
    // A backticked token is only a PATH when it looks like one. The cell also
    // carries field names (`docs.feature`) and prose answers ("Mission
    // Control"), and treating those as paths is the substring-is-not-a-mechanism
    // error in miniature.
    if (!path.includes('/')) continue;
    // Globs and directories: check the containing directory instead.
    if (path.includes('*') || path.endsWith('/')) {
      const dir = path.split('*')[0].replace(/\/$/, '');
      if (dir && !existsSync(P(dir))) {
        fail('HELM_OS_DEAD_AUTHORITY', `docs/HELM_OS.md routes "${row.question}" to ${path}, whose directory does not exist`);
      }
      continue;
    }
    if (!tracked.has(path)) {
      fail('HELM_OS_DEAD_AUTHORITY', `docs/HELM_OS.md routes "${row.question}" to ${path}, which is not tracked`);
      continue;
    }
    const r = retired(path);
    if (r) {
      fail('HELM_OS_RETIRED_AUTHORITY',
        `docs/HELM_OS.md routes "${row.question}" to ${path}, whose own header says ${r}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Registry routes — current authority by definition
// ---------------------------------------------------------------------------
const registry = yaml.load(readFileSync(P('memory/registry.yml'), 'utf-8'));
// path -> every place that routes to it. A Map keyed by path with a single
// value hid a second route: docs/ROUND_REVIEW_ACCURACY_REPORT.md was reachable
// from both golf_round_lifecycle.docs.flows and stats_analytics.docs.incidents,
// and only the last one written was reported — so fixing the reported one left
// the other in place and the checker still failed, pointing at what looked like
// the same problem.
const routed = new Map();
for (const [id, f] of Object.entries(registry.features ?? {})) {
  const d = f.docs ?? {};
  const add = (p, where) => { if (p) routed.set(p, [...(routed.get(p) ?? []), `${id}.${where}`]); };
  add(d.feature, 'docs.feature');
  for (const k of ['flows', 'ui', 'business_logic', 'incidents']) {
    for (const p of d[k] ?? []) add(p, `docs.${k}`);
  }
  for (const p of f.review?.required_docs ?? []) add(p, 'review.required_docs');
}
for (const [p, wheres] of routed) {
  const where = wheres.join(' and ');
  if (!tracked.has(p)) {
    fail('REGISTRY_DEAD_ROUTE', `memory/registry.yml ${where} routes to ${p}, which is not tracked`);
    continue;
  }
  const r = retired(p);
  if (r) {
    fail('REGISTRY_RETIRED_ROUTE',
      `memory/registry.yml ${where} routes to ${p}, whose own header says ${r} — a retired document cannot be current authority`);
  }
}

// ---------------------------------------------------------------------------
// 3. Generated documents must name a generator that exists
// ---------------------------------------------------------------------------
for (const f of readdirSync(P('docs/generated'))) {
  if (!f.endsWith('.md')) continue;
  const p = `docs/generated/${f}`;
  const body = readFileSync(P(p), 'utf-8');
  const m = body.match(/GENERATED by ([^\s]+)/);
  if (!m) {
    fail('GENERATED_WITHOUT_GENERATOR', `${p} does not name its generator`);
  } else if (!tracked.has(m[1])) {
    fail('GENERATED_DEAD_GENERATOR', `${p} names generator ${m[1]}, which is not tracked`);
  }
}

// ---------------------------------------------------------------------------
// 4. A retired document must say what replaced it
// ---------------------------------------------------------------------------
for (const p of tracked) {
  if (!p.endsWith('.md')) continue;
  if (p.startsWith('docs/archive/') || p.startsWith('archive/')) continue;
  const h = head(p);
  if (!h) continue;
  if (!/^STATUS:\s*(SUPERSEDED|HISTORICAL)/mi.test(h)) continue;
  if (!/SUPERSEDED BY|superseded by|replaced by|Where to go instead|current replacement/i.test(h)) {
    fail('RETIRED_WITHOUT_REPLACEMENT',
      `${p} is marked retired but names no replacement — a reader who lands on it has nowhere to go`);
  }
}

// ---------------------------------------------------------------------------
// 5. The docs index must not point Start Here at something retired
// ---------------------------------------------------------------------------
const readme = readFileSync(P('docs/README.md'), 'utf-8');
const startHere = readme.slice(readme.indexOf('## Start here'), readme.indexOf('## `docs/archive/'));
// A Start Here ENTRY is the bolded lead of a list item. A path mentioned mid
// sentence — "this entry used to point at X" — is prose ABOUT a retired
// document, which is the opposite of routing to it, and matching those made the
// checker fail on the very sentences that had fixed the problem.
for (const m of startHere.matchAll(/^- \*\*`([A-Za-z0-9._/*-]+)`\*\*/gm)) {
  const p = m[1];
  if (!tracked.has(p)) continue;
  const r = retired(p);
  if (r) fail('START_HERE_RETIRED', `docs/README.md "Start here" points at ${p}, whose header says ${r}`);
}

// ---------------------------------------------------------------------------
// 6. Prose authority claims — REPORTED, never failed
// ---------------------------------------------------------------------------
const CLAIM = /\b(canonical|single source of truth|source of truth|authoritative)\b/i;
const claimants = [];
for (const p of [...tracked].sort()) {
  if (!p.endsWith('.md')) continue;
  if (p.startsWith('docs/archive/') || p.startsWith('archive/')) continue;
  const body = readFileSync(P(p), 'utf-8');
  if (CLAIM.test(body)) claimants.push(p);
}

// ---------------------------------------------------------------------------

console.log(
  `Authority integrity: ${mapRows.length} mapped question(s), ${routed.size} registry route(s), ` +
    `${claimants.length} document(s) using authority language.`,
);
console.log(
  '   Authority LANGUAGE is reported, never failed — two documents saying "canonical"\n' +
    '   is a prompt to check, not a contradiction. Review with:\n' +
    '     node scripts/knowledge/check-authority.mjs --list-claims',
);
if (process.argv.includes('--list-claims')) for (const c of claimants) console.log(`     ${c}`);

if (problems.length === 0) {
  console.log('✅ Every current authority resolves, is current, and names its source.');
} else {
  const byKind = new Map();
  for (const p of problems) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
  console.error(`\n❌ ${problems.length} authority problem(s):\n`);
  for (const [kind, list] of byKind) {
    console.error(`   ${kind}`);
    for (const p of list) console.error(`     - ${p.detail}`);
    console.error('');
  }
  process.exitCode = 1;
}
