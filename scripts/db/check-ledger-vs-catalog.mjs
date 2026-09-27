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
 *      The catalog is read across every user schema (`isUserSchema`), not
 *      just `public`: migrations create objects in helm_debug, helm_jobs,
 *      helm_private and on storage.objects, and graveyard migrations MOVE
 *      retired tables out of public. An object a LATER applied migration
 *      drops or renames (`parseRemovedObjects`) is not missing either. Until
 *      2026-09-26 neither was honoured and the nightly job reported 258
 *      "missing" objects of which two were real (#1897) — a check that is
 *      always red hides the one finding that matters.
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
const ENV_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnv({ path: resolve(ENV_ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ENV_ROOT, '.env'), quiet: true });

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
    // Skip format() templates from DO-block dynamic SQL (`%1$s_coach_select`,
    // `%I`): those are not object names and can never be in the catalog.
    if (IDENTIFIER.test(m[1])) policies.push(m[1].toLowerCase());
  }

  return {
    tables: [...new Set(tables)],
    functions: [...new Set(functions)],
    policies: [...new Set(policies)],
  };
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const QUALIFIED_NAME = String.raw`"?(?:[a-z_][a-z0-9_]*"?\."?)?([a-z_][a-z0-9_]*)"?`;

/**
 * Parse the object names a migration file's SQL text drops or renames away.
 * Same permissive matching as parseCreatedObjects. Handles schema
 * qualifiers, IF EXISTS, comma lists (`drop table a, b`, `drop function
 * f(uuid), g(int)`), `alter table … rename to` and `alter policy … rename to`.
 * A graveyard `SET SCHEMA` move needs no entry here: the object still exists,
 * in a schema the catalog read already covers.
 *
 * @param {string} sqlText
 * @returns {{ tables: string[], functions: string[], policies: string[] }}
 */
export function parseRemovedObjects(sqlText) {
  const clean = stripSqlComments(sqlText);
  const tables = [];
  const functions = [];
  const policies = [];

  for (const m of clean.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?([^;]+)/gi)) {
    for (const part of splitTopLevel(m[1])) {
      const n = new RegExp(`^\\s*${QUALIFIED_NAME}`, 'i').exec(part);
      if (n) tables.push(n[1].toLowerCase());
    }
  }
  for (const m of clean.matchAll(new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${QUALIFIED_NAME}\\s+rename\\s+to\\s`, 'gi'))) {
    tables.push(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?([^;]+)/gi)) {
    // Split on top-level commas only, so `f(uuid, numeric(10,2))` stays one
    // entry and `numeric` is never mistaken for a dropped function.
    for (const part of splitTopLevel(m[1])) {
      const n = new RegExp(`^\\s*${QUALIFIED_NAME}\\s*\\(`, 'i').exec(part);
      if (n) functions.push(n[1].toLowerCase());
    }
  }
  for (const m of clean.matchAll(new RegExp(`alter\\s+function\\s+${QUALIFIED_NAME}\\s*\\([^)]*\\)\\s+rename\\s+to\\s`, 'gi'))) {
    functions.push(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/(?:drop\s+policy\s+(?:if\s+exists\s+)?|alter\s+policy\s+)"?([^"\s(]+)"?\s+on\s+[^;]*/gi)) {
    const isAlter = /^alter/i.test(m[0]);
    if (isAlter && !/\srename\s+to\s/i.test(m[0])) continue;
    if (IDENTIFIER.test(m[1])) policies.push(m[1].toLowerCase());
  }

  return {
    tables: [...new Set(tables)],
    functions: [...new Set(functions)],
    policies: [...new Set(policies)],
  };
}

/** Split a comma list, ignoring commas nested inside parentheses. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Whether a catalog schema holds objects migrations create. Everything but
 * Postgres's own catalogs counts — including graveyard, where retired tables
 * are moved rather than dropped.
 *
 * @param {string} schema
 */
export function isUserSchema(schema) {
  return schema !== 'information_schema' && !/^pg_/.test(schema);
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
  // kind:name -> the latest APPLIED version that drops or renames it away.
  // Only ledger versions count: a drop sitting in an unapplied local file has
  // not happened in the database.
  const lastRemoval = new Map();
  for (const row of ledgerRows) {
    const file = localFilesByVersion.get(row.version);
    const sqlText = file === undefined ? undefined : fileContents.get(file);
    if (sqlText === undefined) continue;
    const removed = parseRemovedObjects(sqlText);
    for (const [kind, names] of [['table', removed.tables], ['function', removed.functions], ['policy', removed.policies]]) {
      for (const name of names) {
        const key = `${kind}:${name}`;
        if (!lastRemoval.has(key) || lastRemoval.get(key) < row.version) lastRemoval.set(key, row.version);
      }
    }
  }
  const removedLater = (kind, name, version) => {
    const at = lastRemoval.get(`${kind}:${name}`);
    return at !== undefined && at > version;
  };

  const missing = [];
  for (const row of ledgerRows) {
    const file = localFilesByVersion.get(row.version);
    if (!file) continue; // version-level drift is migration-ledger-drift.mjs's job
    const sqlText = fileContents.get(file);
    if (sqlText === undefined) continue;
    const created = parseCreatedObjects(sqlText);
    for (const [kind, names, catalog] of [
      ['table', created.tables, catalogTables],
      ['function', created.functions, catalogFunctions],
      ['policy', created.policies, catalogPolicies],
    ]) {
      for (const name of names) {
        if (catalog.has(name) || removedLater(kind, name, row.version)) continue;
        missing.push({ version: row.version, file, kind, name });
      }
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
    const tableRows = await sql`select schemaname as schema, tablename as name from pg_tables`;
    const funcRows = await sql`select n.nspname as schema, proname as name from pg_proc join pg_namespace n on n.oid = pronamespace`;
    const policyRows = await sql`select schemaname as schema, policyname as name from pg_policies`;

    const names = (rows) =>
      new Set(rows.filter((r) => isUserSchema(String(r.schema))).map((r) => String(r.name).toLowerCase()));
    const catalogTables = names(tableRows);
    const catalogFunctions = names(funcRows);
    const catalogPolicies = names(policyRows);
    // Part 2 (untraceable tables) stays scoped to public, as documented.
    const publicTables = tableRows.filter((r) => r.schema === 'public').map((r) => String(r.name).toLowerCase());

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
      catalogTables: publicTables,
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
