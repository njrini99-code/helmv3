#!/usr/bin/env node
/**
 * rls-coverage.mjs — RLS/grant coverage census (D5 task 3).
 *
 * Read-only. Connects the same way `check-supabase-drift.mjs` does
 * (`DATABASE_URL`, or `SUPABASE_PROJECT_ID` + `SUPABASE_DB_PASSWORD` via
 * `.env.local`) and NEVER writes. Three plain SELECTs against
 * `information_schema`/`pg_catalog`, plus a read of every file under
 * `supabase/tests/rls/`, then hands the results to the pure logic in
 * `src/lib/observability/supabase/rls-coverage.ts` (fixture-tested
 * independently of any live database — see that file's `__tests__`).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/db/rls-coverage.mjs
 * or:
 *   SUPABASE_PROJECT_ID=... SUPABASE_DB_PASSWORD=... node scripts/db/rls-coverage.mjs
 *
 * Output: one JSON object on stdout (`RlsCoverageReport`).
 * Exit 0: ran and produced a report (findings may be non-zero — this is a
 *         census, not a pass/fail gate).
 * Exit 2: could not connect (missing/invalid credentials) — same meaning
 *         as check-supabase-drift.mjs's exit 2, so CI can tell "no DB
 *         available" apart from "connected and found problems".
 */
import postgres from 'postgres';
import { config as loadEnv } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath, dirname } from 'node:path';
import { buildRlsCoverageReport } from '../../src/lib/observability/supabase/rls-coverage.ts';

const POOLER_HOST = 'aws-0-us-east-1.pooler.supabase.com';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(__dirname, '..', '..');

// Load .env.local first, then .env as a FALLBACK. dotenv does not override an
// already-set variable, so .env.local keeps precedence; .env only fills gaps.
// This exists because SUPABASE_ACCESS_TOKEN has historically lived in .env
// while the connection vars live in .env.local — a script loading only one of
// them saw the token or not depending on which file it happened to read, and
// the same credential produced different results per script.
//
// Both paths resolve from the REPO ROOT, never cwd: these are run from npm
// scripts, worktrees and CI, and a relative '.env.local' silently loaded
// nothing whenever cwd was not the repo root.
loadEnv({ path: resolvePath(REPO_ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolvePath(REPO_ROOT, '.env'), quiet: true });

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (projectId && password) {
    return `postgresql://postgres.${projectId}:${encodeURIComponent(password)}@${POOLER_HOST}:6543/postgres`;
  }
  return null;
}

function readRlsTestFileContents() {
  const dir = resolvePath(REPO_ROOT, 'supabase', 'tests', 'rls');
  let entries = [];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  } catch {
    return [];
  }
  return entries.map((f) => {
    try {
      return readFileSync(resolvePath(dir, f), 'utf8');
    } catch {
      return '';
    }
  });
}

async function main() {
  const connectionString = buildConnectionString();
  if (!connectionString) {
    console.error(
      'rls-coverage: no DATABASE_URL and no SUPABASE_PROJECT_ID/SUPABASE_DB_PASSWORD — cannot connect.',
    );
    process.exit(2);
  }

  const sql = postgres(connectionString, { ssl: 'require', max: 1, idle_timeout: 5 });

  try {
    const tableRows = await sql`
      select schemaname as schema, tablename as table, rowsecurity as "rlsEnabled"
      from pg_tables
      where schemaname in ('public', 'helm_debug')
    `;

    const policyRows = await sql`
      select schemaname as schema, tablename as table, policyname as "policyName"
      from pg_policies
      where schemaname in ('public', 'helm_debug')
    `;

    const functionRows = await sql`
      select
        n.nspname as schema,
        p.proname as name,
        p.prosecdef as "securityDefiner",
        coalesce(
          array_agg(distinct r.rolname) filter (
            where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
              and r.rolname in ('anon', 'authenticated', 'service_role')
          ),
          '{}'
        ) as "granteeRoles"
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
      where n.nspname = 'public'
      group by n.nspname, p.proname, p.prosecdef, p.oid
    `;

    const testFileContents = readRlsTestFileContents();

    const tables = tableRows.map((r) => ({ schema: r.schema, table: r.table, rlsEnabled: r.rlsEnabled }));
    const policies = policyRows.map((r) => ({ schema: r.schema, table: r.table, policyName: r.policyName }));
    const functions = functionRows.map((r) => ({
      schema: r.schema,
      name: r.name,
      securityDefiner: r.securityDefiner,
      granteeRoles: r.granteeRoles ?? [],
    }));

    const report = buildRlsCoverageReport(tables, policies, functions, testFileContents);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 0;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((err) => {
  console.error('rls-coverage: failed:', err?.message ?? err);
  process.exit(2);
});
