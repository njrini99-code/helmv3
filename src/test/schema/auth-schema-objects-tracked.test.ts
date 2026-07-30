// =============================================================================
// Objects that live in the `auth` schema must be created by a TRACKED migration.
//
// WHY THIS EXISTS — a real, months-long gap, found the hard way.
//
// Production has one non-internal trigger on an auth table:
//
//   CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
//     FOR EACH ROW EXECUTE FUNCTION handle_new_user()
//
// Nothing in `supabase/migrations/` created it. The active baseline
// (`20260527000000_prod_public_baseline.sql`) is a PUBLIC-SCHEMA-ONLY dump — its
// first DDL is `CREATE SCHEMA IF NOT EXISTS "public"` and it emits nothing for
// `auth` — so it captured `public.handle_new_user()` (a public function) but could
// not capture the trigger, which is an object ON an auth table. A public-schema
// dump structurally cannot carry it.
//
// The consequence was invisible for months: on any database built from the
// tracked migrations — `supabase start`, a Supabase preview branch, a restore
// drill — inserting into `auth.users` did not create the `public.users` row, so
// signup was silently broken there. It only surfaced when the required
// BaseballHelm smoke gate was repointed from production to a local stack and the
// demo seed died on `baseball_coaches_user_id_fkey`, a FK into `public.users`.
//
// WHY A SOURCE-TEXT TEST AND NOT A DATABASE TEST. The pgTAP suites run against a
// database that already had the defect, so they could not see it — they assert
// behaviour given a schema, and the schema itself was what was missing. This test
// asserts the *migration set is complete*, which is a property of the files. It
// needs no database and runs in the fast unit project.
//
// This does not attempt to enumerate every possible auth-schema object. It pins
// the one we know production depends on and lost once, so it cannot be lost again
// silently.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Strip SQL comments before matching.
 *
 * Necessary, not fastidious: the first version of the "must not DROP TRIGGER"
 * assertion below failed on the tracked migration itself, because that file's
 * header comment EXPLAINS why it does not drop the trigger — and so contains the
 * words. A guard that reads prose as code fires on documentation.
 */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function trackedMigrationSql(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({
      file,
      sql: stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8')),
    }));
}

describe('auth-schema objects are created by tracked migrations', () => {
  const migrations = trackedMigrationSql();

  it('reads a non-trivial migration set (guards against an empty-glob pass)', () => {
    // Without this, a wrong MIGRATIONS_DIR would make every assertion below
    // vacuously... fail, actually — but a future refactor to `.some()` semantics
    // could make it vacuously pass. Pin the precondition explicitly.
    expect(migrations.length).toBeGreaterThan(100);
  });

  it('creates the on_auth_user_created trigger on auth.users', () => {
    const creators = migrations.filter(({ sql }) =>
      /CREATE\s+TRIGGER\s+on_auth_user_created/i.test(sql) &&
      /ON\s+auth\.users/i.test(sql),
    );

    expect(
      creators.map((c) => c.file),
      'No tracked migration creates `on_auth_user_created` on auth.users. ' +
        'Production HAS this trigger; without it, a database built from these ' +
        'migrations silently fails to create the public.users row on signup, and ' +
        'every FK into public.users breaks. The archived copies under ' +
        'supabase/migrations_archive/ do not count — nothing applies them.',
    ).not.toHaveLength(0);
  });

  it('points that trigger at public.handle_new_user, which is itself tracked', () => {
    const triggerSql = migrations
      .filter(({ sql }) => /CREATE\s+TRIGGER\s+on_auth_user_created/i.test(sql))
      .map(({ sql }) => sql)
      .join('\n');

    // A trigger that fires the wrong function is worse than a missing one: it
    // looks present and does nothing useful.
    expect(triggerSql).toMatch(/EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?handle_new_user\s*\(\s*\)/i);

    const definesFn = migrations.some(({ sql }) =>
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"?public"?\."?handle_new_user"?/i.test(sql),
    );
    expect(definesFn, 'handle_new_user() must also be defined by a tracked migration').toBe(true);
  });

  it('creates it conditionally, so applying it to production cannot change production', () => {
    // The trigger already exists in production. A DROP-then-CREATE would take
    // ACCESS EXCLUSIVE on auth.users, leave a window with no trigger, and
    // silently overwrite whatever production actually has if the two ever
    // diverge. The tracked form must therefore check before creating.
    const file = migrations.find(({ sql }) =>
      /CREATE\s+TRIGGER\s+on_auth_user_created/i.test(sql) && /ON\s+auth\.users/i.test(sql),
    );
    expect(file).toBeDefined();
    if (!file) return;

    expect(
      /IF\s+NOT\s+EXISTS\s*\(/i.test(file.sql),
      `${file.file}: must guard the CREATE TRIGGER with an existence check`,
    ).toBe(true);
    expect(
      /DROP\s+TRIGGER/i.test(file.sql),
      `${file.file}: must NOT drop the production trigger to recreate it`,
    ).toBe(false);
  });
});
