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

// The guard's RULES moved to scripts/lib/seed-target-guard.ts and are now
// asserted by EXECUTION in scripts/lib/__tests__/seed-target-guard.test.ts
// (21 cases, including the two typo-squat classes a grep cannot see: a
// look-alike domain resolving to the prod ref, and `.local` accepted as a
// loopback suffix). What is left here is the part only source text can check —
// that each seed script actually WIRES the guard up, ahead of its first write.
// A perfect guard nobody calls is the failure mode this file still covers.
it('the demo seed is dry-run by default and gates writes before the first one', async () => {
  const source = await readSeed();
  assert.match(source, /DRY = !confirmed/, 'must be dry-run unless --confirm is passed');
  assert.match(
    source,
    /from '\.\/lib\/seed-target-guard'/,
    'must use the shared target guard, not a private copy that can drift from it',
  );
  assert.match(source, /assertWriteTargetAllowed\(\{/, 'must gate writes on the resolved project ref');

  // The gate has to run before the first write, not after it.
  const gateAt = source.indexOf('assertWriteTargetAllowed({');
  const firstUpsertAt = source.indexOf("await upsert('organizations'");
  assert.ok(gateAt > 0, 'assertWriteTargetAllowed must be called from main()');
  assert.ok(firstUpsertAt > 0, 'expected the organizations upsert to still exist');
  assert.ok(gateAt < firstUpsertAt, 'the write gate must run before the first write');

  // The gate must be inside the `!DRY` branch — a dry run has to stay runnable
  // against any target, since printing a plan is how you find out the target is
  // wrong in the first place.
  assert.match(source, /if \(!DRY\) \{\s*\n\s*assertWriteTargetAllowed/);
});

// EVERY baseball seed that CI runs, not just the demo one. seed-baseball-e2e.ts
// shipped with NO target guard at all while .github/workflows/playwright.yml ran
// it against PRODUCTION on every push to main — the demo seed's guard had been
// in place since f7ffa28b9 and simply never reached its sibling. That is the
// failure mode a per-script inline guard has, so the list is asserted here.
it('every CI-invoked baseball seed wires up the shared target guard', async () => {
  const CI_SEEDS = ['seed-baseball-demo.ts', 'seed-baseball-e2e.ts'];
  for (const name of CI_SEEDS) {
    const source = await readFile(join(REPO_ROOT, 'scripts', name), 'utf8');
    assert.match(
      source,
      /from '\.\/lib\/seed-target-guard'/,
      `${name}: must import the shared target guard`,
    );
    assert.match(
      source,
      /assertWriteTargetAllowed\(\{/,
      `${name}: importing the guard is not calling it`,
    );
    assert.match(source, /DRY = !confirmed/, `${name}: must be dry-run unless --confirm is passed`);
  }
});

// An earlier version of the guard named the production ref
// HELM_DEMO_PROJECT_REF and let it through on --confirm alone — an allowlist on
// the one target the guard exists to protect, which reads as protection while
// being its opposite. The name must not come back anywhere in the seed lane.
it('production is never described as the expected demo project', async () => {
  const files = [
    join(REPO_ROOT, 'scripts', 'seed-baseball-demo.ts'),
    join(REPO_ROOT, 'scripts', 'seed-baseball-e2e.ts'),
    join(REPO_ROOT, 'scripts', 'lib', 'seed-target-guard.ts'),
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /HELM_DEMO_PROJECT_REF/, `${file}: production is not the demo project`);
  }
});

// The CI seed must not carry --allow-prod. Since 2026-07-30 the baseball smoke
// gate seeds a LOCAL Supabase stack (.github/workflows/ci.yml,
// .github/workflows/playwright.yml), where the guard allows the write with no
// flag at all. Keeping --allow-prod in the npm script would mean that if the
// production credentials ever leak back into that job's env — the exact
// regression this change exists to prevent — the seed would silently write to
// production again instead of refusing.
it('the CI seed script cannot write to production', async () => {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
  const ciSeed = pkg.scripts['seed:baseball:ci'];
  assert.ok(ciSeed, 'expected a seed:baseball:ci script');
  assert.doesNotMatch(
    ciSeed,
    /--allow-prod/,
    'seed:baseball:ci must not carry the production escape hatch',
  );
  assert.match(ciSeed, /--confirm/, 'seed:baseball:ci still has to actually write');
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
