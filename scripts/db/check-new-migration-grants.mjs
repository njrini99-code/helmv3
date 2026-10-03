#!/usr/bin/env node
/**
 * scripts/db/check-new-migration-grants.mjs — PR-scoped Data API grants gate.
 *
 * From 20261003120000_public_default_privileges_explicit.sql on (and on every
 * Supabase project from 2026-10-30), a table created in `public` gets NO
 * privileges for anon, authenticated or service_role unless a migration grants
 * them. A migration that creates a table and relies on the old auto-grant
 * still applies cleanly. Then every server read of that table fails with
 * "permission denied", and no test that ran before production catches it.
 *
 * This gate is scoped to the PR, the same way as
 * scripts/db/check-new-migrations-in-schema.sh: a migration ADDED in the PR
 * that creates a public table, view or materialized view must GRANT it to
 * service_role in the same file (`GRANT ... ON [TABLE] <name>[, ...] TO ...
 * service_role`, or `GRANT ... ON ALL TABLES IN SCHEMA public TO ...
 * service_role`). A file that genuinely cannot do that carries a
 * `-- GRANTS: exempt <reason>` comment anywhere in the file.
 *
 * Out of scope: TEMP tables, non-public schemas, and `CREATE OR REPLACE VIEW`
 * (which usually replaces an existing view and keeps its grants).
 *
 * Usage:
 *   node scripts/db/check-new-migration-grants.mjs [<base-ref>]
 *   node scripts/db/check-new-migration-grants.mjs --files <path> [<path> ...]
 *
 * Exit 0 = every new migration grants its new public relations, or is exempt.
 * Exit 1 = at least one new public relation has no service_role grant.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const EXEMPT_RE = /^[ \t]*--[ \t]*GRANTS:[ \t]*exempt\b/im;

// One identifier: "quoted" or bare.
const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QUALIFIED = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;

const CREATE_RE = new RegExp(
  String.raw`\bCREATE\s+` +
    String.raw`(?:(?:GLOBAL|LOCAL)\s+)?` +
    String.raw`(?:(TEMP|TEMPORARY|UNLOGGED)\s+)?` +
    String.raw`(TABLE|MATERIALIZED\s+VIEW|(?:RECURSIVE\s+)?VIEW)\s+` +
    String.raw`(?:IF\s+NOT\s+EXISTS\s+)?` +
    `(${QUALIFIED})`,
  'gi',
);

const GRANT_RE = /\bGRANT\s+([\s\S]*?)\bON\s+([\s\S]*?)\bTO\s+([\s\S]*?)(?:;|$)/gi;

/** Strip `--` line comments and block comments so prose can't count. */
export function stripSqlComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function unquote(ident) {
  const trimmed = ident.trim();
  return trimmed.startsWith('"') ? trimmed.slice(1, -1) : trimmed.toLowerCase();
}

/**
 * Split a possibly schema-qualified name into { schema, name }. Unqualified
 * names resolve to `public` (the migration runner's search_path).
 */
export function parseQualifiedName(raw) {
  const parts = raw.match(new RegExp(IDENT, 'g')) ?? [];
  if (parts.length >= 2) return { schema: unquote(parts[0]), name: unquote(parts[1]) };
  return { schema: 'public', name: unquote(parts[0] ?? '') };
}

/** Public relations (tables, views, materialized views) a migration creates. */
export function findCreatedPublicRelations(sqlText) {
  const sql = stripSqlComments(sqlText);
  const created = [];
  for (const m of sql.matchAll(CREATE_RE)) {
    if (m[1]) {
      const kind = m[1].toUpperCase();
      if (kind === 'TEMP' || kind === 'TEMPORARY') continue;
    }
    // `CREATE OR REPLACE VIEW` does not match CREATE_RE (OR REPLACE sits
    // between CREATE and VIEW), so it is skipped by construction.
    const { schema, name } = parseQualifiedName(m[3]);
    if (schema !== 'public' || !name) continue;
    if (!created.includes(name)) created.push(name);
  }
  return created;
}

/**
 * Names (in `public`) this migration GRANTs to service_role, plus a flag for
 * `ON ALL TABLES IN SCHEMA public ... TO service_role`.
 */
export function findServiceRoleGrants(sqlText) {
  const sql = stripSqlComments(sqlText);
  const names = new Set();
  let allTables = false;
  for (const m of sql.matchAll(GRANT_RE)) {
    const target = m[2].trim();
    const grantees = m[3]
      .split(',')
      .map((g) => g.trim().replace(/\s+WITH\s+GRANT\s+OPTION\s*$/i, '').replace(/"/g, '').toLowerCase());
    if (!grantees.includes('service_role')) continue;

    if (/^ALL\s+TABLES\s+IN\s+SCHEMA\s+/i.test(target)) {
      const schemas = target
        .replace(/^ALL\s+TABLES\s+IN\s+SCHEMA\s+/i, '')
        .split(',')
        .map((s) => unquote(s));
      if (schemas.includes('public')) allTables = true;
      continue;
    }
    // Only table targets: `ON TABLE x` or a bare `ON x`. Skip every other
    // object class (FUNCTION, SEQUENCE, SCHEMA, ...).
    let list = target;
    if (/^TABLE\s+/i.test(list)) list = list.replace(/^TABLE\s+/i, '');
    else if (/^(ALL|TABLES|FUNCTION|FUNCTIONS|PROCEDURE|PROCEDURES|ROUTINE|ROUTINES|SEQUENCE|SEQUENCES|SCHEMA|DATABASE|DOMAIN|TYPE|LANGUAGE|LARGE\s+OBJECT|TABLESPACE|FOREIGN)\b/i.test(list)) continue;
    for (const item of list.split(',')) {
      const { schema, name } = parseQualifiedName(item);
      if (schema === 'public' && name) names.add(name);
    }
  }
  return { names, allTables };
}

/** True when the file carries a `-- GRANTS: exempt <reason>` comment. */
export function isGrantsExempt(sqlText) {
  return EXEMPT_RE.test(sqlText);
}

/**
 * Pure check for one migration's text. Returns the public relations it creates
 * without a service_role grant in the same file (empty when exempt).
 */
export function findUngrantedRelations(sqlText) {
  if (isGrantsExempt(sqlText)) return [];
  const created = findCreatedPublicRelations(sqlText);
  if (created.length === 0) return [];
  const { names, allTables } = findServiceRoleGrants(sqlText);
  if (allTables) return [];
  return created.filter((name) => !names.has(name));
}

function addedMigrations(baseRef) {
  try {
    execFileSync('git', ['fetch', '--quiet', 'origin', baseRef.replace(/^origin\//, '')], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
  } catch {
    // Offline or a SHA base: the diff below still works when the ref exists.
  }
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=A', `${baseRef}...HEAD`, '--', 'supabase/migrations/'],
    { cwd: REPO_ROOT, encoding: 'utf-8' },
  );
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.sql'));
}

function main(argv) {
  let files;
  const filesIdx = argv.indexOf('--files');
  if (filesIdx !== -1) {
    files = argv.slice(filesIdx + 1);
  } else {
    const envBase = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : '';
    const baseRef = argv[0] || envBase || 'origin/main';
    files = addedMigrations(baseRef);
  }

  if (files.length === 0) {
    process.stdout.write('OK: no new migration files to check for grants.\n');
    return 0;
  }

  let failed = 0;
  for (const file of files) {
    const path = resolve(REPO_ROOT, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf-8');
    if (isGrantsExempt(text)) {
      process.stdout.write(`EXEMPT: ${file}\n`);
      continue;
    }
    const missing = findUngrantedRelations(text);
    if (missing.length > 0) {
      failed += 1;
      process.stderr.write(
        `MISSING GRANT: ${file} creates public relation(s) with no service_role grant in the same file:\n` +
          missing.map((n) => `  public.${n}`).join('\n') +
          '\n',
      );
    } else {
      process.stdout.write(`OK: ${file}\n`);
    }
  }

  if (failed > 0) {
    process.stderr.write(
      '\nFAILED: new public tables no longer receive Data API grants automatically.\n' +
        'Add explicit grants in the same migration (.claude/rules/database.md "Grants"):\n' +
        '  GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO service_role;\n' +
        '  GRANT SELECT, ... ON public.<table> TO authenticated;   -- only what RLS needs; never anon\n' +
        '  GRANT USAGE, SELECT ON SEQUENCE public.<table>_id_seq TO service_role;  -- serial columns\n' +
        "or add a '-- GRANTS: exempt <reason>' comment to the migration.\n",
    );
    return 1;
  }
  process.stdout.write('OK: every new migration grants its new public relations or is exempt.\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
