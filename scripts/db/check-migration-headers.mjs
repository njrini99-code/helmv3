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
 *   -- VERIFY:    one SELECT per line that must return at least one row for
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
 * Flags:
 *   --update   Rewrite the baseline from the current violations and exit 0.
 *
 * Exit codes: 0 clean, 1 a non-baselined file is missing a required header.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
    return new Set(Array.isArray(parsed.grandfathered) ? parsed.grandfathered : []);
  } catch {
    return new Set();
  }
}

function main() {
  const update = process.argv.includes('--update');
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  const violations = [];
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const { needsHeaders, hasRollback, hasVerify } = classifyMigration(text);
    if (needsHeaders && (!hasRollback || !hasVerify)) {
      violations.push(file);
    }
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
