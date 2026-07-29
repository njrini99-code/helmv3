// Static contract guard for scripts/seed-baseball-demo.ts (the Phase-1 demo seed).
//
// WHY A SOURCE-TEXT TEST: this script's only real execution target is a live
// Supabase project, so there is no cheap way to exercise it in CI. But the two
// defects it shipped with were both visible in the source:
//
//   1. It upserted three tables that had been moved into the `graveyard` schema
//      on 2026-07-04. Those writes could only fail, the failure text matched
//      the script's own "schema not present yet" filter, the rows were deleted
//      from the run summary, and the script still printed a success banner.
//      That is un-noticeable at run time and trivially checkable here — and the
//      list of dead tables is read FROM THE MIGRATIONS, so this guard cannot
//      go stale the next time something is graveyarded.
//
//   2. It had no protection against being pointed at the wrong Supabase
//      project. `--confirm` says "yes, write"; it does not say "yes, write HERE".
//
// Runs in the `unit` vitest project (wired in vitest.config.ts).

import { it, expect } from 'vitest';

// node:assert/strict shims over vitest's `expect`.
//
// These assertions were written for `node --test`, which nothing in this repo
// runs — 46 sibling files under scripts/__tests__/ are in exactly that state,
// passing locally and gating nothing. Rather than rewrite every assertion (and
// risk changing what they assert while doing it), the four forms used here are
// mapped onto vitest so the file runs in the `unit` project unchanged. The
// second argument becomes expect's label, so failure messages survive.
const assert = {
  ok: (value, message) => expect(value, message).toBeTruthy(),
  equal: (actual, expected, message) => expect(actual, message).toBe(expected),
  notEqual: (actual, expected, message) => expect(actual, message).not.toBe(expected),
  deepEqual: (actual, expected, message) => expect(actual, message).toEqual(expected),
  match: (value, pattern, message) => expect(value, message).toMatch(pattern),
  doesNotMatch: (value, pattern, message) => expect(value, message).not.toMatch(pattern),
};

import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SEED_FILE = join(REPO_ROOT, 'scripts', 'seed-baseball-demo.ts');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

const readSeed = () => readFile(SEED_FILE, 'utf8');

/**
 * Every table any graveyard migration moves out of `public`, parsed from the
 * migrations themselves rather than hardcoded here.
 */
async function graveyardedTables() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.includes('graveyard'));
  assert.ok(files.length > 0, 'expected at least one *graveyard*.sql migration to exist');

  const tables = new Set();
  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const arrayBlock = sql.match(/tables\s+text\[\]\s*:=\s*ARRAY\[([\s\S]*?)\]/);
    assert.ok(arrayBlock, `${file}: could not find the ARRAY[...] table list`);
    for (const m of arrayBlock[1].matchAll(/'([a-z0-9_]+)'/g)) tables.add(m[1]);
  }
  return tables;
}

/** Every table name the seed passes to its upsert() helper. */
function upsertedTables(source) {
  return new Set([...source.matchAll(/upsert\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1]));
}

it('graveyard parse finds the known 2026-07-04 dead Lift Lab tables', async () => {
  const dead = await graveyardedTables();
  for (const t of [
    'baseball_lift_assignments',
    'baseball_lift_results',
    'baseball_readiness_checkins',
  ]) {
    assert.ok(dead.has(t), `${t} should be parsed out of the graveyard migrations`);
  }
});

it('the demo seed never writes to a graveyarded table', async () => {
  const dead = await graveyardedTables();
  const written = upsertedTables(await readSeed());
  const violations = [...written].filter((t) => dead.has(t));
  assert.deepEqual(
    violations,
    [],
    `seed-baseball-demo.ts upserts table(s) that live in the graveyard schema: ${violations.join(', ')}. ` +
      'Those writes silently no-op while the run reports success.',
  );
});

it('the demo seed never CITES a graveyarded table as an insight/timeline source', async () => {
  const dead = await graveyardedTables();
  const source = await readSeed();
  // source_refs entries (`table: 'x'`) and timeline events (`source_type: 'x'`)
  // are the two places a dead table can be referenced without being written —
  // producing an evidence drawer that resolves to nothing.
  const cited = [
    ...source.matchAll(/(?:\btable|source_type):\s*'([a-z0-9_]+)'/g),
  ].map((m) => m[1]);
  const violations = [...new Set(cited.filter((t) => dead.has(t)))];
  assert.deepEqual(violations, [], `demo cites graveyarded table(s): ${violations.join(', ')}`);
});

it('the demo seed covers every surface the demo has to open', async () => {
  const written = upsertedTables(await readSeed());
  const requiredTables = [
    // Team operations
    'baseball_announcements',
    'baseball_announcement_recipients',
    'baseball_announcement_acknowledgements',
    'baseball_travel_itineraries',
    'baseball_travel_expenses',
    'baseball_documents',
    'baseball_document_versions',
    // Postgame action review (and the game + box score it is built from)
    'baseball_games',
    'baseball_box_score_batting',
    'baseball_box_score_pitching',
    'baseball_postgame_reviews',
    'baseball_postgame_review_items',
    // Lift Lab progression
    'helm_lifting_maxes',
    'helm_lifting_bodyweight_entries',
  ];
  for (const table of requiredTables) {
    assert.ok(written.has(table), `seed-baseball-demo.ts must seed ${table}`);
  }
});

it('the demo seed seeds no recruiting data (module is sunset)', async () => {
  const written = upsertedTables(await readSeed());
  for (const table of [
    'baseball_watchlists',
    'baseball_recruiting_interests',
    'baseball_player_comparisons',
  ]) {
    assert.equal(
      written.has(table),
      false,
      `${table} is recruiting data; the recruiting module ships disabled (src/lib/baseball/product-modules.ts)`,
    );
  }
});

it('the demo seed is deterministic — no randomness, no id-shifting clock reads', async () => {
  const source = await readSeed();
  assert.doesNotMatch(source, /Math\.random\s*\(/, 'row content must not be random');
  assert.doesNotMatch(source, /crypto\.randomUUID\s*\(/, 'row ids must be derived, not minted');
  // Dates hang off ONE captured base date (`const NOW = new Date()`), so a
  // re-run moves timestamps but never row identity. A bare Date.now() sprinkled
  // through the row builders is how that guarantee gets lost.
  assert.doesNotMatch(source, /Date\.now\s*\(/, 'derive timestamps from NOW, not Date.now()');
  assert.match(source, /const NOW = new Date\(\)/);
});

it('the demo seed is dry-run by default and treats PRODUCTION as a deny, not an allow', async () => {
  const source = await readSeed();
  assert.match(source, /DRY = !confirmed/, 'must be dry-run unless --confirm is passed');
  assert.match(source, /assertWriteTargetAllowed/, 'must gate writes on the resolved project ref');
  assert.match(source, /--allow-project/, 'must offer an explicit, typed-out override');

  // THE thing this test exists for. An earlier version of the guard named the
  // production ref HELM_DEMO_PROJECT_REF and let it through on --confirm alone
  // — an allowlist on the one target the guard exists to protect, which reads
  // as protection while being its opposite. The sibling scripts
  // (seed-baseball-stats.mjs:85, seed-baseball-box-scores.mjs:36) treat the
  // same ref as a deny requiring --allow-prod; this must match them.
  assert.doesNotMatch(
    source,
    /HELM_DEMO_PROJECT_REF/,
    'production must not be described as the expected demo project',
  );
  assert.match(source, /HELM_PROD_PROJECT_REF/, 'must name production to refuse it');
  assert.match(source, /--allow-prod/, 'production must require its own explicit flag');
  const prodRefAt = source.indexOf('HELM_PROD_PROJECT_REF)');
  const allowProdAt = source.indexOf("hasFlag('--allow-prod')");
  assert.ok(prodRefAt > 0 && allowProdAt > prodRefAt, 'the prod branch must gate on --allow-prod');

  // A ref is only a ref if the host is really a Supabase domain. Without this,
  // `https://<prodref>.example.invalid` resolved to the production ref and was
  // waved through on a first-label substring match.
  assert.match(source, /SUPABASE_DOMAINS/, 'must verify the host is a Supabase domain before trusting its first label');
  assert.doesNotMatch(
    source,
    /host\.endsWith\('\.local'\)/,
    "a routable .local mDNS name on the operator's LAN is not loopback",
  );
  // The gate has to run before the first write, not after it.
  const gateAt = source.indexOf('if (!DRY) assertWriteTargetAllowed(target)');
  const firstUpsertAt = source.indexOf("await upsert('organizations'");
  assert.ok(gateAt > 0, 'assertWriteTargetAllowed must be called from main()');
  assert.ok(firstUpsertAt > 0, 'expected the organizations upsert to still exist');
  assert.ok(gateAt < firstUpsertAt, 'the write gate must run before the first write');
});

it('the demo seed still upserts only — no delete-then-insert of seeded rows', async () => {
  const source = await readSeed();
  // The single permitted delete is the login_attempts lockout clear, which is
  // scoped to the two demo emails and creates nothing.
  const deletes = [...source.matchAll(/\.delete\(\)/g)];
  assert.equal(deletes.length, 1, 'exactly one .delete() (the login_attempts lockout clear) is allowed');
  assert.match(source, /from\('login_attempts'\)\s*\n?\s*\.delete\(\)/);
});

it('a skipped table is reported instead of vanishing from the summary', async () => {
  const source = await readSeed();
  // `skipped` used to be collected and never printed: a write that failed the
  // schema check disappeared from `counts` with nothing taking its place, and
  // the run still ended on the success banner.
  assert.match(source, /SKIPPED — these tables\/columns were NOT seeded/);
});
