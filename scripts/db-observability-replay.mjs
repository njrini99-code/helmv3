#!/usr/bin/env node
/**
 * Replay-fixture runner - brief 57.
 *
 * Prints one row per fixture: mechanism -> expected classification ->
 * observed. Same fixtures and same engine the vitest suite uses
 * (src/lib/observability/supabase/__fixtures__/), so the table and the test
 * suite can never disagree about what the classifier did.
 *
 * Usage:
 *   node scripts/db-observability-replay.mjs           # human table
 *   node scripts/db-observability-replay.mjs --json    # machine report
 *
 * Exit 0: every fixture matched its declared contract.
 * Exit 1: at least one mismatch (a real failure, never a NOT VERIFIED).
 *
 * NEVER TOUCHES A DATABASE. The engine passes an injected fake client into
 * the recorder, so `createAdminClient()` is never constructed, no
 * service-role secret is read, and no request leaves the process. That is a
 * property of the code path, not of the environment this runs in.
 *
 * WHY IT RE-EXECS ITSELF
 * ----------------------
 * The production pipeline it exercises is TypeScript, and plain Node cannot
 * resolve either a `.ts` import or this repo's `@/` alias. `tsx` is the
 * repo's established way to run TypeScript from a script (see the many
 * `tsx scripts/*.ts` entries in package.json), and `--import tsx/esm`
 * installs it as a loader rather than through the tsx CLI - which needs a
 * unix socket for IPC and therefore cannot start inside the agent sandbox.
 * Re-execing keeps `node scripts/db-observability-replay.mjs` working as
 * written, with no wrapper to remember.
 */
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BOOTSTRAP_FLAG = 'HELM_REPLAY_TSX_LOADER';

if (!process.env[BOOTSTRAP_FLAG]) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx/esm', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, [BOOTSTRAP_FLAG]: '1' } },
  );
  process.exit(result.status ?? 1);
}

/**
 * `server-only` is a Next.js BUILD-TIME guard with no runtime behaviour, and
 * this repo does not install it as a package - Next provides it. So a bare
 * `import 'server-only'` (observe-result.ts, integrity.ts, record-db-error.ts
 * all carry one) is unresolvable outside a Next build. vitest.config.ts
 * already solves this by aliasing it to `src/test/stubs/server-only.ts`;
 * this is the same alias for the same reason, expressed as a Node resolve
 * hook because there is no vite config here to put it in.
 *
 * `registerHooks` (synchronous, in-thread) rather than `register` so the
 * hook needs no separate loader file and composes with the tsx loader that
 * is already installed above.
 */
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only' || specifier === 'client-only') {
      return {
        url: pathToFileURL(join(REPO_ROOT, 'src/test/stubs/server-only.ts')).href,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});

const JSON_MODE = process.argv.includes('--json');

const { REPLAY_FIXTURES } = await import('../src/lib/observability/supabase/__fixtures__/replay-fixtures.ts');
const { compareFixture, fingerprintGroups, persistedStringsOf } = await import(
  '../src/lib/observability/supabase/__fixtures__/replay-runner.ts'
);
const { ALL_SENTINELS, SENTINEL_FRAGMENTS } = await import(
  '../src/lib/observability/supabase/__fixtures__/privacy-sentinels.ts'
);

const rows = [];
let failures = 0;

for (const fixture of REPLAY_FIXTURES) {
  const result = compareFixture(fixture);
  if (!result.ok) failures += 1;

  // The privacy sweep runs on every fixture that produced an envelope, not
  // only on the one named for it - a sentinel that leaked through a
  // different mechanism is the same leak.
  const leaked = [];
  if (result.observed.envelope) {
    const persisted = persistedStringsOf(result.observed.envelope).join(' ');
    for (const needle of [...ALL_SENTINELS, ...SENTINEL_FRAGMENTS]) {
      if (persisted.includes(needle)) leaked.push(needle);
    }
  }
  if (leaked.length > 0) failures += 1;

  rows.push({
    id: fixture.id,
    title: fixture.title,
    expected: fixture.expected.recorded
      ? `${fixture.expected.bucket} / ${fixture.expected.code}`
      : `${fixture.expected.bucket} / not recorded`,
    observed: result.observed.recorded
      ? `${result.observed.bucket} / ${result.observed.code}`
      : `${result.observed.bucket ?? 'none'} / not recorded`,
    fingerprint: result.observed.fingerprint || '(none)',
    recorderCalls: result.observed.recorderCalls.length,
    mismatches: result.mismatches,
    leakedSentinels: leaked,
    ok: result.ok && leaked.length === 0,
  });
}

// Dedupe: one mechanism, one fingerprint. A collision here means two
// distinct failures would be filed as one incident.
const collisions = [...fingerprintGroups(REPLAY_FIXTURES).entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([fingerprint, ids]) => ({ fingerprint, ids }));
if (collisions.length > 0) failures += collisions.length;

/**
 * The half of dedupe that CANNOT be proven here. `record_db_error_event`'s
 * fingerprint/hour-bucket upsert is what collapses repeated occurrences into
 * one row with an incrementing count, and that migration is HELD and
 * unapplied (supabase/migrations/HELD.md). A fixture can prove two
 * occurrences produce one KEY; only a live database proves they produce one
 * ROW. Stated rather than quietly claimed.
 */
const notVerified = [
  {
    item: 'occurrence_count collapsing',
    reason:
      'record_db_error_event is HELD and unapplied; a fixture proves one dedupe KEY, not one stored ROW',
  },
  {
    item: 'Postgres really raises these SQLSTATEs for these interleavings',
    reason:
      'the fixtures assert classification of an error shape, not that Postgres produces that shape; needs a local stack',
  },
];

if (JSON_MODE) {
  console.log(
    JSON.stringify({ ok: failures === 0, rows, collisions, notVerified }, null, 2),
  );
  process.exit(failures === 0 ? 0 : 1);
}

const pad = (s, n) => String(s).padEnd(n);
console.log('\nSupabase replay fixtures - brief 57\n');
console.log(
  `${pad('FIXTURE', 40)}${pad('EXPECTED', 44)}${pad('OBSERVED', 44)}RESULT`,
);
console.log('-'.repeat(134));
for (const row of rows) {
  console.log(
    `${pad(row.id, 40)}${pad(row.expected, 44)}${pad(row.observed, 44)}${row.ok ? 'PASS' : 'FAIL'}`,
  );
  for (const m of row.mismatches) {
    console.log(`  ! ${m.field}: expected ${JSON.stringify(m.expected)}, observed ${JSON.stringify(m.observed)}`);
  }
  for (const s of row.leakedSentinels) {
    console.log(`  ! PRIVACY: sentinel survived into the persisted record (${s.slice(0, 24)}...)`);
  }
}

console.log('\nDedupe');
console.log(
  collisions.length === 0
    ? '  one fingerprint per mechanism across all fixtures - no collisions'
    : collisions.map((c) => `  ! COLLISION ${c.fingerprint} <- ${c.ids.join(', ')}`).join('\n'),
);

console.log('\nNOT VERIFIED (never counted as a pass, never counted as a failure)');
for (const item of notVerified) console.log(`  - ${item.item}: ${item.reason}`);

console.log(
  `\n${failures === 0 ? 'PASS' : 'FAIL'} - ${rows.length} fixtures, ${failures} failure(s). No database was contacted.\n`,
);
process.exit(failures === 0 ? 0 : 1);
