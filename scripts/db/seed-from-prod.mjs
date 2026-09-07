#!/usr/bin/env node
/**
 * scripts/db/seed-from-prod.mjs — D1, Helm Database Plan.
 *
 * Pulls a bounded, REDACTED sample of production data through the
 * repo-local Supabase CLI's read path (`supabase db query --linked`, which
 * goes through the Management API using the CLI's own logged-in token —
 * never the MCP `execute_sql` tool, per `.claude/rules/shipping.md` and
 * this track's brief) and writes `supabase/seed/prod-sample-seed.sql`,
 * which `supabase db reset` loads on every local stack rebuild.
 *
 * HARD RULES (do not relax any of these without re-reading the brief):
 *   - SELECT ... LIMIT only. Never a write of any kind against production.
 *   - Never `auth.users` — GoTrue rows cannot be reproduced from SQL and
 *     the local user path is documented in supabase/seed/v3-seed.sql.
 *   - Never the whole table — every query carries the row cap.
 *   - Never unredacted PII. Every email, phone, and free-text field named
 *     in REDACT_COLUMNS is rewritten before it touches disk. After
 *     redaction, the script re-scans its own output and REFUSES to write
 *     if any '@' survives outside the fixed redaction domain
 *     (`seed.example`) — a defect in a table's redaction map must not
 *     silently leak a real address.
 *   - Idempotent: re-running overwrites the same generated file with the
 *     same shape; the SQL itself uses ON CONFLICT DO NOTHING so loading it
 *     twice against a non-empty database (shouldn't happen — `db reset`
 *     always starts clean — but defence in depth) never errors.
 *
 * Usage:
 *   npm run db:seed:refresh
 *   node scripts/db/seed-from-prod.mjs --limit 50 --tables golf_teams,golf_coaches
 *   node scripts/db/seed-from-prod.mjs --dry-run   # print, don't write
 *
 * Requires the repo-local CLI to be linked/logged in
 * (`./node_modules/.bin/supabase login` + `supabase link`) with read access
 * to the production project. Fails loudly and writes nothing if it isn't —
 * it never falls back to a partial or stale write.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SUPABASE_CLI = resolve(REPO_ROOT, 'node_modules/.bin/supabase');
const OUTPUT_PATH = resolve(REPO_ROOT, 'supabase/seed/prod-sample-seed.sql');
const REDACTION_DOMAIN = 'seed.example';
const DEFAULT_LIMIT = 200;

/**
 * The allowlist: exactly enough for a coach and a player to log in (via the
 * documented `scripts/seed-local-users.ts` / app-signup path, which binds
 * auth.users rows to these) and see a team. Sourced from what
 * `e2e/fixtures/golf-auth.ts` and the existing v3-seed.sql fixture path
 * need. Every table is `public.*`. Ordered so children never precede a
 * parent id they might one day need to fixture against.
 *
 * `redact` maps a column name to a redaction kind:
 *   'email'  -> rewritten to `<table>-<row#>@seed.example`
 *   'phone'  -> rewritten to a fixed placeholder
 *   'name'   -> rewritten to a synthetic "<Table> Sample <row#>" label
 *   'text'   -> free-text notes/bio — nulled out entirely
 */
const ALLOWLIST = [
  { table: 'organizations', orderBy: 'created_at', redact: { name: ['name'] } },
  { table: 'golf_teams', orderBy: 'created_at', redact: {} },
  {
    table: 'golf_coaches',
    orderBy: 'created_at',
    redact: { email: ['email'], phone: ['phone'], name: ['full_name'], text: ['bio'] },
  },
  {
    table: 'golf_players',
    orderBy: 'created_at',
    redact: { email: ['email'], phone: ['phone'], name: ['first_name', 'last_name'] },
  },
  { table: 'golf_team_coach_staff', orderBy: 'created_at', redact: {} },
  { table: 'golf_team_members', orderBy: 'created_at', redact: {} },
];

function parseArgs(argv) {
  const args = { limit: DEFAULT_LIMIT, tables: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--tables') args.tables = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--dry-run') args.dryRun = true;
    else {
      process.stderr.write(`seed-from-prod: unknown flag ${a}\n`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0 || args.limit > 1000) {
    process.stderr.write('seed-from-prod: --limit must be a positive integer <= 1000\n');
    process.exit(2);
  }
  return args;
}

function queryLinked(sql) {
  const raw = execFileSync(
    SUPABASE_CLI,
    ['db', 'query', '--linked', '--output-format', 'json', sql],
    { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  );
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.rows)) {
    throw new Error(`unexpected response shape from 'supabase db query --linked': ${raw.slice(0, 200)}`);
  }
  return parsed.rows;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value) || (typeof value === 'object')) {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Redact one row in place per the table's `redact` map. Returns the row. */
function redactRow(row, redact, table, idx) {
  for (const col of redact.email ?? []) {
    if (col in row && row[col] != null) row[col] = `${table}-${idx}@${REDACTION_DOMAIN}`;
  }
  for (const col of redact.phone ?? []) {
    if (col in row && row[col] != null) row[col] = '+15550100000';
  }
  for (const col of redact.name ?? []) {
    if (col in row && row[col] != null) row[col] = `${table} Sample ${idx}`;
  }
  for (const col of redact.text ?? []) {
    if (col in row && row[col] != null) row[col] = null;
  }
  return row;
}

/**
 * Final safety net: scan every string value written to the generated file
 * for an '@'. Every surviving one must belong to the redaction domain.
 * A hit here means some column outside a table's declared `redact` map
 * carries an email production put there — refuse to write rather than
 * guess.
 */
function assertNoForeignEmails(sqlText) {
  const matches = sqlText.match(/[^\s'"]+@[^\s'")]+/g) ?? [];
  const foreign = matches.filter((m) => !m.endsWith(`@${REDACTION_DOMAIN}`) && !m.endsWith(`@${REDACTION_DOMAIN}'`));
  if (foreign.length > 0) {
    throw new Error(
      `seed-from-prod: refusing to write — found ${foreign.length} '@' occurrence(s) outside ` +
        `the ${REDACTION_DOMAIN} redaction domain (first: ${foreign[0]}). A table's redact map is ` +
        'missing a column. Nothing was written.',
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tables = args.tables
    ? ALLOWLIST.filter((t) => args.tables.includes(t.table))
    : ALLOWLIST;

  if (tables.length === 0) {
    process.stderr.write('seed-from-prod: no matching tables in the allowlist\n');
    process.exit(2);
  }

  if (!existsSync(SUPABASE_CLI)) {
    process.stderr.write(`seed-from-prod: repo-local CLI not found at ${SUPABASE_CLI}\n`);
    process.exit(1);
  }

  const sections = [];
  const summary = [];

  for (const { table, orderBy, redact } of tables) {
    // Explicit column list would be more defensive, but every allowlisted
    // table is small/first-party — `select *` plus the redact map catching
    // every PII-shaped column is the same guarantee with one less place
    // (a hand-maintained column list) to fall out of sync with the schema.
    const sql = `select * from public.${table} order by ${orderBy} desc nulls last limit ${args.limit};`;
    let rows;
    try {
      rows = queryLinked(sql);
    } catch (err) {
      process.stderr.write(
        `seed-from-prod: failed to read public.${table} via 'supabase db query --linked' — ` +
          'is the repo-local CLI logged in and linked to the production project? ' +
          `Nothing was written.\n${String(err?.message ?? err)}\n`,
      );
      process.exit(1);
    }

    rows.forEach((row, idx) => redactRow(row, redact, table, idx));
    summary.push(`--   ${table}: ${rows.length} row(s)`);

    if (rows.length === 0) {
      sections.push(`-- ${table}: 0 rows sampled, nothing to insert.`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    const valuesSql = rows
      .map((row) => `  (${columns.map((c) => sqlLiteral(row[c])).join(', ')})`)
      .join(',\n');
    sections.push(
      `INSERT INTO public.${table} (${columns.join(', ')})\nVALUES\n${valuesSql}\nON CONFLICT (id) DO NOTHING;`,
    );
  }

  const header = [
    '-- prod-sample-seed.sql — GENERATED FILE. Do not hand-edit.',
    '--',
    '-- Regenerate with: npm run db:seed:refresh (scripts/db/seed-from-prod.mjs)',
    `-- Generated: ${new Date().toISOString()}`,
    `-- Row cap per table: ${args.limit}`,
    '-- Redacted: email -> <table>-<row#>@seed.example, phone -> fixed placeholder,',
    '-- name columns -> synthetic "<Table> Sample <row#>" labels, free-text notes/bio -> NULL.',
    '-- auth.users is NEVER sampled — see supabase/seed/v3-seed.sql for the local user path.',
    '--',
    '-- Table row counts this run:',
    ...summary,
    '',
    'DO $$',
    'BEGIN',
    "  IF to_regclass('public.golf_teams') IS NULL THEN",
    "    RAISE EXCEPTION 'prod-sample-seed: public.golf_teams not found. Apply migrations first.';",
    '  END IF;',
    'END $$;',
    '',
  ].join('\n');

  const body = sections.join('\n\n') + '\n';
  const full = `${header}${body}`;

  assertNoForeignEmails(full);

  if (args.dryRun) {
    process.stdout.write(full);
    return;
  }

  writeFileSync(OUTPUT_PATH, full, 'utf-8');
  process.stdout.write(`seed-from-prod: wrote ${OUTPUT_PATH}\n${summary.join('\n')}\n`);
}

main().catch((err) => {
  process.stderr.write(`seed-from-prod: ${String(err?.message ?? err)}\n`);
  process.exit(1);
});
