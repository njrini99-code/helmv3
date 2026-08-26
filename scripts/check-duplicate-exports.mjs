#!/usr/bin/env node
/**
 * check-duplicate-exports.mjs — fail when the same function name is exported
 * from two different files under src/app.
 *
 * The 2026-08-26 architecture review found 15 server-action names exported
 * twice from different golf action files (createCourse in both courses.ts and
 * course-library.ts, acknowledgeInsight in two files, and so on). That shape
 * is the mechanical signature of an agent that could not find — or could not
 * afford to read — the original, and wrote a second one. Two implementations
 * of the same mutation then coexist, and the next reader has to guess which
 * one the UI calls.
 *
 * This check makes that drift shape impossible to reintroduce silently.
 * Existing duplicates are grandfathered in .duplicate-exports-baseline.json
 * until the dedupe pass resolves them; the count may only go DOWN.
 *
 * Usage:
 *   node scripts/check-duplicate-exports.mjs            # check
 *   node scripts/check-duplicate-exports.mjs --update   # rewrite the baseline
 *
 * Pure stdlib.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE = '.duplicate-exports-baseline.json';
const ROOT = 'src/app';
const EXPORT_RE = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm;

function tsFiles(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) tsFiles(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && !p.includes('__tests__')) out.push(p);
  }
  return out;
}

const byName = new Map();
for (const f of tsFiles(ROOT)) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(EXPORT_RE)) {
    const name = m[1];
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(f);
  }
}

// page.tsx/route.ts export the same framework names by design — only flag
// names defined in MORE than one file after dropping framework entry points.
const FRAMEWORK = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
  'generateMetadata', 'generateStaticParams', 'middleware',
]);

const dups = [...byName.entries()]
  .filter(([name, files]) => !FRAMEWORK.has(name) && new Set(files).size > 1)
  .map(([name, files]) => `${name} :: ${[...new Set(files)].sort().join(' + ')}`)
  .sort();

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify({
    $comment: 'Function names exported from more than one file under src/app. ' +
      'May only go DOWN. Resolve by picking a survivor and re-exporting, then ' +
      'deleting — never by renaming one copy to hide the duplication.',
    total: dups.length, entries: dups,
  }, null, 2)}\n`);
  console.log(`Baseline written: ${dups.length} duplicate export names.`);
  process.exit(0);
}

let known = new Set();
try {
  const b = JSON.parse(readFileSync(BASELINE, 'utf8'));
  known = new Set(b.entries ?? []);
} catch { /* no baseline yet */ }

// A duplicate counts as known if the NAME was already duplicated, even if a
// file moved — the ratchet targets the shape, not the exact paths.
const knownNames = new Set([...known].map((e) => e.split(' :: ')[0]));
const fresh = dups.filter((d) => !knownNames.has(d.split(' :: ')[0]));

if (fresh.length) {
  console.error(`❌ ${fresh.length} NEW duplicate export name(s) under src/app:\n`);
  for (const d of fresh) console.error(`   ${d}`);
  console.error(
    '\n   The original exists — find it, extend it, or import it. A second' +
    '\n   implementation of the same name is how the 15 grandfathered pairs' +
    '\n   were born.',
  );
  process.exit(1);
}

if (dups.length < known.size) {
  console.log(
    `duplicate-exports: dropped (${known.size} → ${dups.length}) — run ` +
    'node scripts/check-duplicate-exports.mjs --update to lock in the gains',
  );
}
console.log(`✅ No new duplicate exports. ${dups.length} known remain — ratchet them down.`);
