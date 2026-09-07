#!/usr/bin/env node
/**
 * scripts/db/lint-functions.mjs — `npm run db:lint:functions` (D1, Helm
 * Database Plan). Runs `plpgsql_check_function` over every plpgsql function
 * in the `public` schema of the LOCAL Supabase stack — plpgsql_check is
 * enabled local-only, never in production
 * (supabase/seed/local-only-extensions.sql; see supabase/config.toml's
 * extension-parity comment).
 *
 * Fails (exit 1) on any plpgsql_check "error:" line. "warning:" lines are
 * printed but do not fail the run — see the brief: "failing on errors,
 * warnings listed."
 *
 * Defaults to the local stack (127.0.0.1:54322); override with
 * DATABASE_URL for a different target (e.g. CI's own ephemeral instance).
 */
import postgres from 'postgres';

const DEFAULT_LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
  const connectionString = process.env.DATABASE_URL || DEFAULT_LOCAL_URL;
  const sql = postgres(connectionString, { max: 1, connect_timeout: 10 });

  try {
    const ext = await sql`select 1 from pg_extension where extname = 'plpgsql_check'`;
    if (ext.length === 0) {
      process.stderr.write(
        'db:lint:functions: plpgsql_check extension is not installed on this database. ' +
          'Run `npm run db:local` (which loads supabase/seed/local-only-extensions.sql) first.\n',
      );
      process.exit(2);
    }

    const functions = await sql`
      select p.oid::text as oid, n.nspname as schema, p.proname as name,
             p.prorettype::regtype::text as ret_type
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
      where n.nspname = 'public'
        and l.lanname = 'plpgsql'
      order by p.proname
    `;

    let hadError = false;
    const warnings = [];
    const skipped = [];

    for (const fn of functions) {
      // A trigger function needs a real relation id to type-check
      // NEW/OLD/TG_* — plpgsql_check cannot infer one from the function
      // alone. Resolve one via pg_trigger (any relation actually using it
      // is representative); a trigger function with no attached trigger
      // anywhere (dead code, or attached only via a DDL path this query
      // missed) is SKIPPED and named, not silently dropped.
      let relid = '0';
      if (fn.ret_type === 'trigger') {
        const trig = await sql`
          select tgrelid::text as relid from pg_trigger where tgfoid = ${fn.oid}::oid limit 1
        `;
        if (trig.length === 0) {
          skipped.push(`${fn.schema}.${fn.name}: trigger function with no attached trigger found — skipped`);
          continue;
        }
        relid = trig[0].relid;
      }

      let rows;
      try {
        rows = await sql`select * from extensions.plpgsql_check_function(${fn.oid}::regprocedure, ${relid}::regclass, performance_warnings := false, extra_warnings := true)`;
      } catch (err) {
        // A function plpgsql_check itself cannot analyze (e.g. an unusual
        // signature) is reported, not silently skipped.
        warnings.push(`${fn.schema}.${fn.name}: plpgsql_check crashed — ${String(err?.message ?? err)}`);
        continue;
      }
      for (const row of rows) {
        const line = Object.values(row)[0];
        if (typeof line !== 'string') continue;
        if (/^error:/i.test(line)) {
          hadError = true;
          process.stdout.write(`FAIL  ${fn.schema}.${fn.name}: ${line}\n`);
        } else if (/^warning:/i.test(line)) {
          warnings.push(`${fn.schema}.${fn.name}: ${line}`);
        }
      }
    }

    process.stdout.write(`\nChecked ${functions.length - skipped.length} of ${functions.length} plpgsql function(s) in public.\n`);
    if (skipped.length > 0) {
      process.stdout.write(`\n${skipped.length} skipped:\n`);
      for (const s of skipped) process.stdout.write(`SKIP  ${s}\n`);
    }
    if (warnings.length > 0) {
      process.stdout.write(`\n${warnings.length} warning(s):\n`);
      for (const w of warnings) process.stdout.write(`WARN  ${w}\n`);
    }

    if (hadError) {
      process.stderr.write('\ndb:lint:functions: one or more functions failed plpgsql_check.\n');
      process.exit(1);
    }
    process.stdout.write('\ndb:lint:functions: PASS\n');
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((err) => {
  process.stderr.write(`db:lint:functions: ${String(err?.message ?? err)}\n`);
  process.exit(2);
});
