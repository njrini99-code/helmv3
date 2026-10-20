#!/usr/bin/env node
/**
 * scripts/db/check-migration-headers.mjs — D3, Helm Database Plan.
 *
 * A migration under supabase/migrations/ that touches DATA or DDL
 * (INSERT/UPDATE/DELETE/DROP/ALTER) must carry two header blocks so
 * `scripts/db/apply.mjs` and a human reviewer both have something to act on
 * without re-deriving it from the SQL body:
 *
 *   -- ROLLBACK:  one or more lines describing how to undo this migration's
 *                 effect (a compensating statement, or a named reason none
 *                 is needed — e.g. "additive only, DROP COLUMN to revert").
 *   -- VERIFY:    SELECTs that must each return at least one row for
 *                 the migration to be considered successfully applied.
 *                 scripts/db/apply.mjs runs every line under this block
 *                 after a real `--apply`.
 *
 * Existing files are GRANDFATHERED via .migration-headers-baseline.json,
 * ratchet-style (same shape as .lint-baseline.json / lint-ratchet.mjs): the
 * baseline can only shrink. A NEW migration file (not in the baseline) that
 * matches the mutating-keyword pattern and lacks either header ALWAYS fails,
 * regardless of baseline size.
 *
 * VERIFY SHAPE. scripts/db/apply.mjs joins `-- VERIFY:` lines into queries
 * and runs them after an apply. A continuation line that lost its `-- VERIFY:`
 * prefix (a reflow), or prose on a VERIFY line, yields a query that is cut off
 * or not SQL at all, and the post-apply check fails AFTER production changed.
 * Every extracted query must start with `select`/`with`, have balanced
 * parentheses and quotes, and not end on a dangling keyword or operator.
 * Files that already shipped with a malformed block are grandfathered in
 * `verifyGrandfathered` (same ratchet rule).
 *
 * Flags:
 *   --update   Rewrite the baseline from the current violations and exit 0.
 *
 * Exit codes: 0 clean, 1 a non-baselined file is missing a required header.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractVerifyQueries } from './apply.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase/migrations');
const BASELINE_PATH = join(REPO_ROOT, '.migration-headers-baseline.json');

const MUTATING_KEYWORD_RE = /\b(INSERT\s+INTO|UPDATE\s+\S|DELETE\s+FROM|DROP\s+(TABLE|COLUMN|FUNCTION|INDEX|POLICY|EXTENSION|TRIGGER|VIEW|MATERIALIZED\s+VIEW|SCHEMA)|ALTER\s+(TABLE|COLUMN|FUNCTION|POLICY|EXTENSION))\b/i;

/**
 * Pure classification for one migration file's text. No I/O — unit-testable
 * directly.
 * @returns {{ needsHeaders: boolean, hasRollback: boolean, hasVerify: boolean }}
 */
export function classifyMigration(sqlText) {
  const stripped = stripSqlComments(sqlText);
  const needsHeaders = MUTATING_KEYWORD_RE.test(stripped);
  const hasRollback = /^--\s*ROLLBACK:/im.test(sqlText);
  const hasVerify = /^--\s*VERIFY:/im.test(sqlText);
  return { needsHeaders, hasRollback, hasVerify };
}

/** VERIFY queries in this file that apply.mjs could not run as written. */
export function malformedVerifyQueries(sqlText) {
  const bad = extractVerifyQueries(sqlText).filter((q) => !isRunnableVerify(q));
  // A VERIFY line with no `;` followed by a plain `--` line: the next line is a
  // continuation that lost its prefix, so the joined query is silently cut off.
  const lines = sqlText.split('\n').map((l) => l.trim());
  for (let i = 0; i < lines.length - 1; i += 1) {
    const isVerify = /^--\s*VERIFY:/i.test(lines[i]);
    const next = lines[i + 1];
    if (
      isVerify &&
      !/;\s*(--.*)?$/.test(lines[i]) &&
      /^--\s*\S/.test(next) &&
      !/^--\s*(VERIFY|ROLLBACK|STATUS)\b/i.test(next)
    ) {
      bad.push(`${lines[i].replace(/^--\s*VERIFY:\s*/i, '')} …(continued on a line without -- VERIFY:)`);
    }
  }
  return bad;
}

function isRunnableVerify(query) {
  const body = query.replace(/;\s*$/, '').trim();
  if (!/^(select|with)\b/i.test(body)) return false;
  let depth = 0;
  let inQuote = false;
  for (const ch of body) {
    if (inQuote) {
      if (ch === "'") inQuote = false;
    } else if (ch === "'") inQuote = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
  }
  if (depth !== 0 || inQuote) return false;
  return !/(\b(in|where|and|or|from|join|on|select|by|not|as|like|then|else|when|is)|[,=(<>+*/-])$/i.test(body);
}

/** Strip `--` line comments and `/* *\/` block comments before keyword-scanning,
 *  so a migration's own prose discussing "DROP TABLE" in an explanation
 *  doesn't count as the migration doing it. */
function stripSqlComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function loadBaseline(key = 'grandfathered') {
  if (!existsSync(BASELINE_PATH)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
    return new Set(Array.isArray(parsed[key]) ? parsed[key] : []);
  } catch {
    return new Set();
  }
}

function main() {
  const update = process.argv.includes('--update');
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  const violations = [];
  const verifyViolations = [];
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const { needsHeaders, hasRollback, hasVerify } = classifyMigration(text);
    if (needsHeaders && (!hasRollback || !hasVerify)) {
      violations.push(file);
    }
    if (malformedVerifyQueries(text).length > 0) verifyViolations.push(file);
  }

  if (update) {
    writeFileSync(
      BASELINE_PATH,
      JSON.stringify(
        {
          _comment:
            'Ratchet baseline for scripts/db/check-migration-headers.mjs. Grandfathered ' +
            'pre-existing migrations that mutate data/DDL without a -- ROLLBACK:/-- VERIFY: ' +
            'header. This list may only shrink — regenerate with --update only after adding ' +
            'the missing headers to a file, never to add a NEW file to it.',
          grandfathered: violations,
          verifyGrandfathered: verifyViolations,
        },
        null,
        2,
      ) + '\n',
    );
    process.stdout.write(`check-migration-headers: baseline updated with ${violations.length} grandfathered file(s).\n`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  const newViolations = violations.filter((f) => !baseline.has(f));
  const fixedFiles = [...baseline].filter((f) => !violations.includes(f));

  if (fixedFiles.length > 0) {
    process.stdout.write(
      `check-migration-headers: ${fixedFiles.length} file(s) now have headers but are still in the baseline — ` +
        `run 'node scripts/db/check-migration-headers.mjs --update' to shrink it:\n` +
        fixedFiles.map((f) => `  ${f}`).join('\n') + '\n',
    );
  }

  const verifyBaseline = loadBaseline('verifyGrandfathered');
  const newVerifyViolations = verifyViolations.filter((f) => !verifyBaseline.has(f));
  if (newVerifyViolations.length > 0) {
    process.stderr.write(
      `check-migration-headers: ${newVerifyViolations.length} migration(s) have a -- VERIFY: block ` +
        `that apply.mjs cannot run (prose, a cut-off clause, or a continuation line missing its ` +
        `-- VERIFY: prefix):\n` +
        newVerifyViolations
          .map((f) => `  ${f}: ${malformedVerifyQueries(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))[0].slice(0, 100)}`)
          .join('\n') +
        '\n',
    );
    process.exit(1);
  }

  if (newViolations.length > 0) {
    process.stderr.write(
      `check-migration-headers: ${newViolations.length} migration(s) mutate data/DDL but are missing ` +
        `-- ROLLBACK: and/or -- VERIFY: headers:\n` +
        newViolations.map((f) => `  ${f}`).join('\n') + '\n',
    );
    process.exit(1);
  }

  process.stdout.write(`check-migration-headers: PASS (${baseline.size} grandfathered, 0 new violations).\n`);
}

main();
