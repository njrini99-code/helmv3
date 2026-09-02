#!/usr/bin/env node
/**
 * check-doc-path-drift.mjs — fail when the navigation docs point at files that
 * do not exist.
 *
 * WHY THIS EXISTS
 *
 * CLAUDE.md's routing table sends every session into memory/** before it writes
 * code ("Before starting any GolfHelm task, read the file(s) that match your
 * task type"). On 2026-08-20 an audit found 63 file paths across those docs that
 * resolve to nothing — components, hooks and tests that were moved or deleted
 * while the docs that name them were never updated.
 *
 * A dead path is not a harmless typo here. The doc reads as an inventory, so a
 * session treats "src/components/golf/player-hub/PlayerHub.tsx" as the place the
 * code lives, fails to find it, and either invents a replacement or concludes
 * the feature is missing. Both are confident and wrong, which is the expensive
 * kind.
 *
 * MECHANISM
 *
 * Extract every repo-relative path from the navigation surface and check it
 * resolves. A path resolves if it exists as-is, or with .ts/.tsx/.mjs/.js
 * appended, or as <path>/index.ts(x) — docs legitimately write extensionless
 * module references. Paths containing a glob (`*`) are SKIPPED: `paths:`
 * frontmatter and prose both use globs deliberately, and treating
 * `src/app/golf/actions/round-review*` as a literal filename is a false
 * positive (that glob correctly matches round-reviews.ts).
 *
 * BASELINE
 *
 * .doc-path-baseline.json records the known-bad paths so this lands green and
 * ratchets down, matching .doc-schema-baseline.json and .lint-baseline.json.
 * The count may only shrink.
 *
 * NOTE ON REPAIR: do NOT bulk-repoint these by basename search. The audit tried
 * and the nearest-name matches were build artifacts under src/.helmdev/ and
 * unrelated directories — auto-repointing would replace a path that is visibly
 * broken with one that is confidently wrong. Fix them by hand, in the feature
 * you are already working on, or delete the stale line.
 *
 * Usage:
 *   node scripts/check-doc-path-drift.mjs            # check
 *   node scripts/check-doc-path-drift.mjs --update   # rewrite the baseline
 *
 * Pure stdlib.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE = '.doc-path-baseline.json';
const ROOTS = ['memory', '.claude/rules'];
const SINGLES = ['CLAUDE.md', 'AGENTS.md', 'docs/REPO_MAP.md'];
const PREFIX = '(?:src|docs|memory|scripts|supabase|e2e|tools|public)';
const PATH_RE = new RegExp(`(?:^|[\\s\`"(\\[|])(${PREFIX}/[A-Za-z0-9._/\\[\\]()@*-]+)`, 'g');

function mdFiles(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) mdFiles(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const resolves = (p) => {
  const q = p.replace(/\/+$/, '');
  return [q, `${q}.ts`, `${q}.tsx`, `${q}.mjs`, `${q}.js`,
          join(q, 'index.ts'), join(q, 'index.tsx')].some((c) => existsSync(c));
};

/**
 * Two shapes are legitimately unresolvable and must NOT be reported. A gate with
 * known false positives gets ignored, which is worse than no gate.
 *
 *  1. NEGATED assertions. `integrations.md` says "there is no `src/lib/mapbox/`"
 *     — the doc is correct precisely BECAUSE the path is absent. Flagging it
 *     would demand the author "fix" a true statement.
 *  2. BRACE EXPANSION. `memory/context/baseballhelm-{database,features}.md` is
 *     one reference to several real files; the extractor truncates at `{`.
 */
const NEGATED = /\b(there is no|there's no|no longer|does not exist|doesn't exist|never existed|was removed|has been removed|no map provider|not present)\b/i;
const isIntentional = (line, path) =>
  NEGATED.test(line) || line.includes(`${path}{`) || /\{[^}]*,[^}]*\}/.test(line);

function scan() {
  const files = [...SINGLES.filter(existsSync)];
  for (const r of ROOTS) mdFiles(r, files);
  const broken = {};
  let checked = 0;
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue }
    const lines = text.split('\n');
    const seen = new Set();
    for (const m of text.matchAll(PATH_RE)) {
      const p = m[1].replace(/[.,;:)`\]]+$/, '');
      if (seen.has(p)) continue;
      seen.add(p);
      if (p.includes('*')) continue;          // deliberate glob — not a filename
      checked++;
      if (resolves(p)) continue;
      // Only now pay for the line lookup — most paths resolve.
      const line = lines.find((l) => l.includes(p)) ?? '';
      if (isIntentional(line, p)) continue;
      (broken[f] ??= []).push(p);
    }
  }
  return { broken, checked, files: files.length };
}

const { broken, checked, files } = scan();
const flat = Object.entries(broken).flatMap(([f, ps]) => ps.map((p) => `${f} :: ${p}`)).sort();

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify({
    $comment: 'Paths named in the navigation docs that do not resolve. May only go DOWN. ' +
              'Do NOT bulk-repoint by basename — see scripts/check-doc-path-drift.mjs.',
    total: flat.length, entries: flat,
  }, null, 2)}\n`);
  console.log(`Baseline written: ${flat.length} unresolved paths.`);
  process.exit(0);
}

let known = new Set();
let baseTotal = 0;
try {
  const b = JSON.parse(readFileSync(BASELINE, 'utf8'));
  known = new Set(b.entries ?? []); baseTotal = b.total ?? 0;
} catch { /* first run */ }

const added = flat.filter((e) => !known.has(e));
const fixed = [...known].filter((e) => !flat.includes(e));

console.log(`Checked ${checked} path references across ${files} navigation files.`);
console.log(`${flat.length} do not resolve (baseline ${baseTotal}).`);

let failed = false;
if (added.length) {
  failed = true;
  console.error(`\n❌ ${added.length} NEW doc path(s) pointing at files that do not exist:\n`);
  for (const e of added) console.error(`   ${e}`);
  console.error(`\n   These docs are what CLAUDE.md routes sessions to read FIRST.\n` +
    `   Fix the path, or delete the line if the thing is gone.`);
}
if (fixed.length) {
  failed = true;
  console.error(`\n❌ ${fixed.length} baseline path(s) now resolve — tighten the ratchet:\n`);
  for (const e of fixed) console.error(`   ${e}`);
  console.error(`\n   Run: node scripts/check-doc-path-drift.mjs --update`);
}
if (failed) process.exit(1);
console.log(flat.length === 0
  ? '\n✅ Every path named in the navigation docs resolves.'
  : `\n✅ No new drift. ${flat.length} known bad path(s) remain — ratchet them down.`);
