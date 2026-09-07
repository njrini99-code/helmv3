#!/usr/bin/env node
/**
 * check-ledger-vs-catalog.mjs — object-level drift between the migration
 * ledger and the live catalog.
 *
 * WHAT THIS CHECKS THAT NOTHING ELSE DOES
 *
 * `scripts/db/migration-ledger-drift.mjs` compares VERSIONS: does every
 * ledger row have a local file and vice versa. `scripts/check-migration-ledger.mjs`
 * does the same reconciliation from a different transport. Neither looks
 * INSIDE a migration file — a version can be present on both sides while the
 * table, function, or policy it claims to create is missing from the live
 * database (a failed statement inside an otherwise "applied" migration,
 * `.claude/rules/database.md`'s "applied ≠ recorded" trap made concrete).
 *
 * This script:
 *   1. For every version in `supabase_migrations.schema_migrations`, parses
 *      `CREATE TABLE` / `CREATE [OR REPLACE] FUNCTION` / `CREATE POLICY`
 *      names out of that version's local file (when one exists) and asserts
 *      each object exists in the catalog. Missing -> FAIL.
 *   2. For every table in the `public` schema, asserts it traces to SOME
 *      migration file (any file that CREATEs a table by that name) or to a
 *      schema file under `supabase/schemas/**` (D2's declarative-schema
 *      directory — optional; treated as present-if-it-exists, not required).
 *      Untraceable -> WARN, never FAIL: a table can legitimately predate the
 *      migrations tree or come from an extension.
 *
 * READ-ONLY. Reuses the same Management-API-or-direct-connection transport as
 * check-supabase-drift.mjs (same read-only assertion), never writes.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/db/check-ledger-vs-catalog.mjs
 *   SUPABASE_PROJECT_ID=... SUPABASE_DB_PASSWORD=... node scripts/db/check-ledger-vs-catalog.mjs
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_ID=... node scripts/db/check-ledger-vs-catalog.mjs
 *
 * Exit 0: no FAILs (WARNs print but do not fail the run).
 * Exit 1: at least one missing-in-catalog object.
 * Exit 2: could not connect.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { config as loadEnv } from 'dotenv';
import { createManagementApiSql, buildConnectionString } from './check-supabase-drift.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const SCHEMAS_DIR = resolve(ROOT, 'supabase/schemas');

loadEnv({ path: '.env.local', quiet: true });

// ---------------------------------------------------------------------------
// Pure parsing / reconciliation — no I/O, exported for the unit tests.
// ---------------------------------------------------------------------------

/**
 * Parse the object names a migration file's SQL text claims to create.
 * Deliberately permissive matching (case-insensitive, optional
 * IF NOT EXISTS / OR REPLACE / schema qualifier) over a strict SQL parse —
 * this is a drift SIGNAL, not a linter, and a missed edge case here fails
 * open (nothing flagged) rather than closed.
 *
 * @param {string} sqlText
 * @returns {{ tables: string[], functions: string[], policies: string[] }}
 */
export function parseCreatedObjects(sqlText) {
  const clean = stripSqlComments(sqlText);
  const tables = [];
  const functions = [];
  const policies = [];

  for (const m of clean.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?"?(?:[a-z_][a-z0-9_]*"?\."?)?([a-z_][a-z0-9_]*)"?/gi,
  )) {
    tables.push(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+"?(?:[a-z_][a-z0-9_]*"?\."?)?([a-z_][a-z0-9_]*)"?\s*\(/gi,
  )) {
    functions.push(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/create\s+policy\s+"?([^"\s(]+)"?\s+on\s+/gi)) {
    policies.push(m[1].toLowerCase());
  }

  return {
    tables: [...new Set(tables)],
    functions: [...new Set(functions)],
    policies: [...new Set(policies)],
  };
}

function stripSqlComments(sqlText) {
  return sqlText
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

/**
 * @param {Object} params
 * @param {{ version: string }[]} params.ledgerRows
 * @param {Map<string, string>} params.localFilesByVersion  version -> filename
 * @param {Map<string, string>} params.fileContents          filename -> sql text
 * @param {Set<string>} params.catalogTables
 * @param {Set<string>} params.catalogFunctions
 * @param {Set<string>} params.catalogPolicies
 * @returns {{ version: string, file: string, kind: string, name: string }[]}
 */
export function reconcileLedgerToCatalog({
  ledgerRows,
  localFilesByVersion,
  fileContents,
  catalogTables,
  catalogFunctions,
  catalogPolicies,
}) {
  const missing = [];
  for (const row of ledgerRows) {
    const file = localFilesByVersion.get(row.version);
    if (!file) continue; // version-level drift is migration-ledger-drift.mjs's job
    const sqlText = fileContents.get(file);
    if (sqlText === undefined) continue;
    const created = parseCreatedObjects(sqlText);
    for (const name of created.tables) {
      if (!catalogTables.has(name)) missing.push({ version: row.version, file, kind: 'table', name });
    }
    for (const name of created.functions) {
      if (!catalogFunctions.has(name)) missing.push({ version: row.version, file, kind: 'function', name });
    }
    for (const name of created.policies) {
      if (!catalogPolicies.has(name)) missing.push({ version: row.version, file, kind: 'policy', name });
    }
  }
  return missing;
}

/**
 * @param {Object} params
 * @param {string[]} params.catalogTables
 * @param {Map<string, string>} params.allMigrationFileContents  filename -> sql text
 * @param {string[]} params.schemaFileTableNames  table names found in supabase/schemas/**
 * @returns {string[]} table names with no explaining migration or schema file
 */
export function reconcileUnexplainedTables({
  catalogTables,
  allMigrationFileContents,
  schemaFileTableNames,
}) {
  const explained = new Set(schemaFileTableNames.map((n) => n.toLowerCase()));
  for (const sqlText of allMigrationFileContents.values()) {
    for (const name of parseCreatedObjects(sqlText).tables) explained.add(name);
  }
  return catalogTables.filter((t) => !explained.has(t.toLowerCase()));
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function localMigrationFilesByVersion() {
  const out = new Map();
  const contents = new Map();
  if (!existsSync(MIGRATIONS_DIR)) return { byVersion: out, contents };
  for (const f of readdirSync(MIGRATIONS_DIR)) {
    if (!f.endsWith('.sql')) continue;
    const m = /^(\d+)_/.exec(f);
    if (m) out.set(m[1], f);
    contents.set(f, readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'));
  }
  return { byVersion: out, contents };
}

/** D2's declarative-schema directory is optional; [] when it doesn't exist yet. */
function schemaFileTableNames() {
  if (!existsSync(SCHEMAS_DIR)) return [];
  const names = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.sql')) {
        names.push(...parseCreatedObjects(readFileSync(full, 'utf-8')).tables);
      }
    }
  };
  walk(SCHEMAS_DIR);
  return names;
}

async function main() {
  const connectionString = buildConnectionString();
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const useManagementApi = !connectionString && Boolean(accessToken && projectId);

  if (!connectionString && !useManagementApi) {
    console.error(
      'Missing DATABASE_URL (or SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD), and no ' +
        'SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_ID to fall back on. This script only performs read-only SELECTs.',
    );
    process.exit(2);
  }

  const isLocalConnection = connectionString
    ? /(?:localhost|127\.0\.0\.1|\[::1\])/.test(connectionString)
    : false;
  const sql = useManagementApi
    ? createManagementApiSql(projectId, accessToken)
    : postgres(connectionString, { ssl: isLocalConnection ? false : 'require', max: 1, prepare: false });

  try {
    const ledgerRows = await sql`select version from supabase_migrations.schema_migrations order by version`;
    const tableRows = await sql`select tablename as name from pg_tables where schemaname = 'public'`;
    const funcRows = await sql`select proname as name from pg_proc join pg_namespace n on n.oid = pronamespace where n.nspname = 'public'`;
    const policyRows = await sql`select policyname as name from pg_policies where schemaname = 'public'`;

    const catalogTables = new Set(tableRows.map((r) => String(r.name).toLowerCase()));
    const catalogFunctions = new Set(funcRows.map((r) => String(r.name).toLowerCase()));
    const catalogPolicies = new Set(policyRows.map((r) => String(r.name).toLowerCase()));

    const { byVersion, contents } = localMigrationFilesByVersion();

    const missing = reconcileLedgerToCatalog({
      ledgerRows: ledgerRows.map((r) => ({ version: String(r.version) })),
      localFilesByVersion: byVersion,
      fileContents: contents,
      catalogTables,
      catalogFunctions,
      catalogPolicies,
    });

    const unexplained = reconcileUnexplainedTables({
      catalogTables: [...catalogTables],
      allMigrationFileContents: contents,
      schemaFileTableNames: schemaFileTableNames(),
    });

    console.log('check-ledger-vs-catalog — object-level drift\n' + '='.repeat(60));
    if (missing.length === 0) {
      console.log('✅ every parsed CREATE TABLE/FUNCTION/POLICY in an applied migration exists in the catalog');
    } else {
      console.log(`❌ FAIL — ${missing.length} object(s) an applied migration claims to create are missing from the catalog:`);
      for (const m of missing) console.log(`   [${m.kind}] ${m.name} — ${m.file} (version ${m.version})`);
    }

    if (unexplained.length === 0) {
      console.log('✅ every public table traces to a migration or schema file');
    } else {
      console.log(`⚠️  WARN — ${unexplained.length} public table(s) trace to no migration file and no supabase/schemas/** file:`);
      for (const t of unexplained) console.log(`   ${t}`);
    }

    console.log('='.repeat(60));
    if (missing.length > 0) {
      console.error(`${missing.length} FAIL(s).`);
      process.exit(1);
    }
    console.log('No FAILs. (WARNs above, if any, do not fail this check.)');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  main();
}
