#!/usr/bin/env node
/**
 * migration-ledger-drift.mjs — ratchet for local↔production migration drift.
 *
 * WHY THIS EXISTS
 *
 * "Is this migration applied?" could not be answered from anything in the repo.
 * Measured 2026-08-26 against production: the ledger holds far more rows than
 * the tree holds files, hundreds of applied versions have no local file at all,
 * and a set of local files have no ledger row. Worse, the ledger is not even a
 * reliable index of what is LIVE — five local-only migrations were verified
 * present in the production catalog (`golf_conversation_created_by_me`, the
 * `golf_participants_insert_v2` policy, the `on_auth_user_created` trigger,
 * `get_qualifier_leaderboard`, and `storage.objects` policies) while carrying no
 * ledger row whatsoever. `scripts/db/check-supabase-drift.mjs` says the same in
 * its own header: it refuses to trust `schema_migrations` and queries the
 * catalog instead.
 *
 * So every few weeks somebody re-derives these numbers by hand, writes them into
 * prose, and the prose rots — `guard-bash.sh` still said "56 pending" long after
 * the real figure had moved. `.claude/rules/shipping.md` §1 is explicit: never
 * write a count into prose. This script is the alternative it prescribes — the
 * counts live in `.migration-drift-baseline.json` and may only go DOWN.
 *
 * WHAT IT ENFORCES
 *
 *   unaccounted_local  local .sql files with no ledger row AND no HELD.md entry
 *   production_only    ledger rows with no local file (a rebuild diverges)
 *
 * Both are ratcheted. New drift fails; paying drift down and re-baselining is
 * the only way the number moves. A file deliberately not applied is not drift —
 * record it in `supabase/migrations/HELD.md` and it stops counting, which is
 * exactly what that file was created for.
 *
 * READ-ONLY. One SELECT against `supabase_migrations.schema_migrations`. It
 * never applies, repairs, or stamps anything — applying a migration is R3 under
 * memory/system/golfhelm-engineering-os.md and belongs to the owner.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/db/migration-ledger-drift.mjs
 *   SUPABASE_PROJECT_ID=... SUPABASE_DB_PASSWORD=... node scripts/db/migration-ledger-drift.mjs
 *   ... --update    # re-baseline after paying drift down
 *
 * Exit 0: no new drift.  Exit 1: drift increased.  Exit 2: could not connect.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { config as loadEnv } from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE_PATH = resolve(ROOT, '.migration-drift-baseline.json');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const HELD_PATH = join(MIGRATIONS_DIR, 'HELD.md');
const POOLER_HOST = 'aws-0-us-east-1.pooler.supabase.com';
const UPDATE = process.argv.includes('--update');

loadEnv({ path: '.env.local', quiet: true });

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (projectId && password) {
    return `postgresql://postgres.${projectId}:${encodeURIComponent(password)}@${POOLER_HOST}:6543/postgres`;
  }
  return null;
}

/** Version prefix of every local migration file, mapped to its filename. */
function localMigrations() {
  const out = new Map();
  for (const f of readdirSync(MIGRATIONS_DIR)) {
    if (!f.endsWith('.sql')) continue;
    const m = /^(\d+)_/.exec(f);
    if (m) out.set(m[1], f);
  }
  return out;
}

/**
 * Every version HELD.md accounts for. Deliberately tolerant: the register
 * records some entries as a backticked filename and others as a bare version,
 * so any 14-digit run anywhere in the file counts as "explained". A false
 * ACCOUNTED here is far cheaper than a false DRIFT that trains people to ignore
 * this gate.
 */
function heldVersions() {
  if (!existsSync(HELD_PATH)) return new Set();
  return new Set(readFileSync(HELD_PATH, 'utf8').match(/\d{14}/g) ?? []);
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const conn = buildConnectionString();
  if (!conn) {
    console.error(
      'migration-ledger-drift: no database credentials.\n' +
        '  Set DATABASE_URL, or SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD.',
    );
    return 2;
  }

  const sql = postgres(conn, { idle_timeout: 5, max: 1, onnotice: () => {} });
  let ledger;
  try {
    const rows = await sql`SELECT version FROM supabase_migrations.schema_migrations`;
    ledger = new Set(rows.map((r) => String(r.version)));
  } catch (err) {
    console.error(`migration-ledger-drift: could not read the ledger — ${err.message}`);
    return 2;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  const local = localMigrations();
  const held = heldVersions();

  const productionOnly = [...ledger].filter((v) => !local.has(v)).sort();
  const localOnly = [...local.keys()].filter((v) => !ledger.has(v)).sort();
  const unaccounted = localOnly.filter((v) => !held.has(v));

  const current = {
    unaccounted_local: unaccounted.length,
    production_only: productionOnly.length,
  };

  console.log('Migration ledger drift');
  console.log(`  ledger rows          ${ledger.size}`);
  console.log(`  local .sql files     ${local.size}`);
  console.log(`  in both              ${[...local.keys()].filter((v) => ledger.has(v)).length}`);
  console.log(`  production-only      ${current.production_only}`);
  console.log(`  local-only           ${localOnly.length}`);
  console.log(`    of which held      ${localOnly.length - unaccounted.length}`);
  console.log(`    UNACCOUNTED        ${current.unaccounted_local}`);

  if (unaccounted.length) {
    console.log('\n  Unaccounted local migrations (no ledger row, no HELD.md entry):');
    for (const v of unaccounted) console.log(`    ${local.get(v)}`);
    console.log(
      '\n  Each is either genuinely pending, or live-by-effect and unrecorded.\n' +
        '  Verify against the live catalog — never the ledger — then either apply it\n' +
        '  (owner-executed, R3) or record the decision in supabase/migrations/HELD.md.',
    );
  }

  if (UPDATE) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`\nBaseline written: ${JSON.stringify(current)}`);
    return 0;
  }

  const baseline = readBaseline();
  if (!baseline) {
    console.error(
      `\nNo baseline at ${BASELINE_PATH}. Create it once with:\n` +
        '  npm run db:ledger-drift -- --update',
    );
    return 1;
  }

  let failed = false;
  for (const key of ['unaccounted_local', 'production_only']) {
    const was = baseline[key];
    const now = current[key];
    if (typeof was !== 'number') continue;
    if (now > was) {
      console.error(`\n❌ ${key} rose from ${was} to ${now}. New drift is not allowed.`);
      failed = true;
    } else if (now < was) {
      console.error(
        `\n❌ ${key} fell from ${was} to ${now} — good, but the baseline is now stale.\n` +
          '   Re-run with --update so the ratchet holds at the new number.',
      );
      failed = true;
    }
  }

  if (!failed) console.log('\n✅ No new migration drift.');
  return failed ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`migration-ledger-drift: ${err?.stack || err}`);
    process.exit(2);
  });
