#!/usr/bin/env node
/**
 * check-registry-globs.mjs — fail when memory/registry.yml points at code
 * that no longer exists.
 *
 * The registry is the semantic router: the guard-feature-context hook maps
 * every governed edit through it, and feature docs are loaded by what it
 * says. It is also the one navigation surface no other gate checks —
 * check-doc-path-drift.mjs scans only .md files and deliberately skips
 * globs. A router entry pointing at a moved directory means the map
 * disagrees with the territory while the map is what gets enforced: edits
 * to the live code trigger "maps to NO feature", and the ceremony teaches
 * agents to acknowledge gaps instead of fixing the map.
 *
 * MECHANISM: every `- <path>` entry in registry.yml is either a directory
 * glob (`dir/**`, `dir/*` — the directory must exist) or a literal path
 * (must exist as-is or with .ts/.tsx appended). Failures ratchet against
 * .registry-globs-baseline.json: the count may only go DOWN.
 *
 * Usage:
 *   node scripts/check-registry-globs.mjs            # check
 *   node scripts/check-registry-globs.mjs --update   # rewrite the baseline
 *
 * Pure stdlib.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';

const REGISTRY = 'memory/registry.yml';
const BASELINE = '.registry-globs-baseline.json';

const text = readFileSync(REGISTRY, 'utf8');
const entryRe = /^\s+-\s+([A-Za-z0-9._/\[\]()@-]+(?:\/\*{1,2})?)\s*$/;

const dead = [];
let checked = 0;
for (const line of text.split('\n')) {
  const m = line.match(entryRe);
  if (!m) continue;
  const raw = m[1];
  if (!raw.includes('/')) continue; // feature ids, bare words — not paths
  checked++;
  const globMatch = raw.match(/^(.*?)\/\*{1,2}$/);
  if (globMatch) {
    const dir = globMatch[1];
    if (!existsSync(dir) || !statSync(dir).isDirectory()) dead.push(raw);
    continue;
  }
  if (existsSync(raw)) continue;
  if (existsSync(`${raw}.ts`) || existsSync(`${raw}.tsx`)) continue;
  dead.push(raw);
}

const flat = [...new Set(dead)].sort();

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify({
    $comment: 'Registry entries that resolve to nothing. May only go DOWN. ' +
      'Fix by re-pointing the entry at where the code lives now (often ' +
      'src/components/fairway/pages/*) — never by deleting the feature.',
    total: flat.length, entries: flat,
  }, null, 2)}\n`);
  console.log(`Baseline written: ${flat.length} dead registry entries (of ${checked} checked).`);
  process.exit(0);
}

let known = new Set();
let baseTotal = 0;
try {
  const b = JSON.parse(readFileSync(BASELINE, 'utf8'));
  known = new Set(b.entries ?? []);
  baseTotal = b.total ?? known.size;
} catch { /* no baseline yet — everything is new */ }

const fresh = flat.filter((p) => !known.has(p));

if (fresh.length) {
  console.error(`❌ ${fresh.length} NEW dead registry entr${fresh.length === 1 ? 'y' : 'ies'} (of ${checked} checked):\n`);
  for (const p of fresh) console.error(`   ${p}`);
  console.error(
    '\n   The router gates governed edits through these paths. A dead entry means' +
    '\n   live code maps to no feature while retired paths still demand ceremony.' +
    '\n   Re-point the entry at the current location of the code.',
  );
  process.exit(1);
}

if (flat.length < baseTotal) {
  console.log(
    `registry-globs: dead entries dropped (${baseTotal} → ${flat.length}) — run ` +
    'node scripts/check-registry-globs.mjs --update to lock in the gains',
  );
}
console.log(`✅ No new dead registry entries. ${flat.length} known remain (of ${checked} checked) — ratchet them down.`);
