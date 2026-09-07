#!/usr/bin/env node
/**
 * check-registry-globs.mjs — two checks on memory/registry.yml's code/db
 * globs.
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
 * CHECK 1 — dead entries: every `- <path>` entry in registry.yml is either a
 * directory glob (`dir/**`, `dir/*` — the directory must exist) or a literal
 * path (must exist as-is or with .ts/.tsx appended).
 *
 * CHECK 2 — migration glob overlap (Phase 5 registry glob lint): a
 * feature's `db:` migration glob is too broad when it also matches more
 * than 40% of another feature's (or system's) own migration files — the
 * signature of a blanket glob like the old
 * `team_access_control.db = supabase/migrations/*.sql`, which matched every
 * migration unconditionally and was the dominant cause of
 * scripts/knowledge/bench.mjs's wrong_feature_rate. Also fails if any
 * migration file under supabase/migrations/ maps to zero features/systems —
 * the plan's invariant that every migration has exactly one owner or lives
 * under `systems:`.
 *
 * Both checks ratchet against .registry-globs-baseline.json: known findings
 * may only go DOWN, never up, and a brand-new finding of either kind fails
 * regardless of the baseline.
 *
 * Usage:
 *   node scripts/check-registry-globs.mjs            # check
 *   node scripts/check-registry-globs.mjs --update   # rewrite the baseline
 *
 * Deps: js-yaml (already a repo dependency; every other knowledge/*.mjs
 * checker uses it to parse this same file).
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import * as yaml from 'js-yaml';

const REGISTRY = 'memory/registry.yml';
const BASELINE = '.registry-globs-baseline.json';
const MIGRATIONS_DIR = 'supabase/migrations';
const OVERLAP_THRESHOLD = 0.4;

// ---------------------------------------------------------------------------
// CHECK 1 — dead entries (line-based, unchanged mechanism)
// ---------------------------------------------------------------------------

const text = readFileSync(REGISTRY, 'utf8');
const entryRe = /^\s+-\s+([A-Za-z0-9._/[\]()@-]+(?:\/\*{1,2})?)\s*$/;

const deadFound = [];
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
    if (!existsSync(dir) || !statSync(dir).isDirectory()) deadFound.push(raw);
    continue;
  }
  if (existsSync(raw)) continue;
  if (existsSync(`${raw}.ts`) || existsSync(`${raw}.tsx`)) continue;
  deadFound.push(raw);
}

const deadFlat = [...new Set(deadFound)].sort();

// ---------------------------------------------------------------------------
// CHECK 2 — migration glob overlap + zero-owner migrations
// ---------------------------------------------------------------------------

function globToFilenameRegex(glob) {
  const base = glob.split('/').pop();
  const escaped = base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

let registry = {};
try {
  registry = yaml.load(readFileSync(REGISTRY, 'utf8')) || {};
} catch (err) {
  console.error(`❌ Could not parse ${REGISTRY} as YAML: ${err.message}`);
  process.exit(1);
}

const migrationFiles = existsSync(MIGRATIONS_DIR)
  ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  : [];

// owner id -> { dbGlobs, matchedFiles: Set }
const owners = new Map();

function registerOwner(id, dbGlobs) {
  const patterns = (dbGlobs || [])
    .filter((g) => typeof g === 'string' && g.startsWith(`${MIGRATIONS_DIR}/`))
    .map(globToFilenameRegex);
  if (!patterns.length) return;
  const matched = new Set();
  for (const mf of migrationFiles) {
    if (patterns.some((re) => re.test(mf))) matched.add(mf);
  }
  owners.set(id, { matched });
}

for (const [fid, f] of Object.entries(registry.features || {})) {
  registerOwner(fid, f?.code?.db);
}
for (const [sid, s] of Object.entries(registry.systems || {})) {
  registerOwner(`systems:${sid}`, s?.db);
}

// zero-owner migrations
const ownedFiles = new Set();
for (const { matched } of owners.values()) {
  for (const f of matched) ownedFiles.add(f);
}
const unownedMigrations = migrationFiles.filter((f) => !ownedFiles.has(f)).sort();

// pairwise overlap: does A's matched set cover > 40% of B's own matched set?
const overlaps = [];
const ownerIds = [...owners.keys()];
for (const a of ownerIds) {
  const aSet = owners.get(a).matched;
  if (!aSet.size) continue;
  for (const b of ownerIds) {
    if (a === b) continue;
    const bSet = owners.get(b).matched;
    if (!bSet.size) continue;
    let intersection = 0;
    for (const f of bSet) if (aSet.has(f)) intersection++;
    const ratio = intersection / bSet.size;
    if (ratio > OVERLAP_THRESHOLD) {
      overlaps.push(`${a} matches ${(ratio * 100).toFixed(0)}% of ${b}'s own migration files (${intersection}/${bSet.size})`);
    }
  }
}
const overlapsFlat = [...new Set(overlaps)].sort();

// ---------------------------------------------------------------------------
// Baseline (shared file, three ratcheted lists)
// ---------------------------------------------------------------------------

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify({
    $comment: 'Registry glob findings. Every list may only go DOWN. ' +
      'dead_entries: re-point at where the code lives now — never delete ' +
      'the feature. migration_overlaps: narrow the broader glob to its own ' +
      "feature's actual migrations. unowned_migrations: give the file a " +
      'feature `db:` entry or add it to a `systems:` entry — never leave it unmapped.',
    dead_entries: { total: deadFlat.length, entries: deadFlat },
    migration_overlaps: { total: overlapsFlat.length, entries: overlapsFlat },
    unowned_migrations: { total: unownedMigrations.length, entries: unownedMigrations },
  }, null, 2)}\n`);
  console.log(
    `Baseline written: ${deadFlat.length} dead entries, ${overlapsFlat.length} migration-glob ` +
    `overlaps, ${unownedMigrations.length} unowned migrations (of ${checked} path entries, ` +
    `${migrationFiles.length} migrations checked).`,
  );
  process.exit(0);
}

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch { /* no baseline yet — everything is new */ }

function diffAgainstBaseline(label, current, baselineSection, guidance) {
  const known = new Set(baselineSection?.entries ?? []);
  const baseTotal = baselineSection?.total ?? known.size;
  const fresh = current.filter((p) => !known.has(p));
  return { label, current, fresh, baseTotal, guidance };
}

const sections = [
  diffAgainstBaseline(
    'dead registry entr',
    deadFlat,
    baseline.dead_entries,
    'The router gates governed edits through these paths. A dead entry means\n' +
      '   live code maps to no feature while retired paths still demand ceremony.\n' +
      '   Re-point the entry at the current location of the code.',
  ),
  diffAgainstBaseline(
    'migration-glob overlap',
    overlapsFlat,
    baseline.migration_overlaps,
    "   One feature's db glob is sweeping up another feature's migrations —\n" +
      '   the pattern that made team_access_control match every migration file\n' +
      "   unconditionally. Narrow the broader glob to that feature's own\n" +
      '   migration-name patterns.',
  ),
  diffAgainstBaseline(
    'unowned migration',
    unownedMigrations,
    baseline.unowned_migrations,
    '   Every migration must map to exactly one feature `db:` entry, or to a\n' +
      "   `systems:` entry's `db:` list for a genuinely cross-cutting sweep.\n" +
      '   This one maps to neither.',
  ),
];

let failed = false;
for (const s of sections) {
  if (s.fresh.length) {
    failed = true;
    console.error(`❌ ${s.fresh.length} NEW ${s.label}${s.fresh.length === 1 ? 'y' : 'ies'}:\n`);
    for (const p of s.fresh) console.error(`   ${p}`);
    console.error(`\n${s.guidance}\n`);
  } else if (s.current.length < s.baseTotal) {
    console.log(
      `registry-globs: ${s.label}ies dropped (${s.baseTotal} → ${s.current.length}) — run ` +
      'node scripts/check-registry-globs.mjs --update to lock in the gains',
    );
  }
}

if (failed) process.exit(1);

console.log(
  `✅ No new registry-glob findings. ${deadFlat.length} dead entries, ${overlapsFlat.length} ` +
  `migration-glob overlaps, ${unownedMigrations.length} unowned migrations known — ratchet them down.`,
);
