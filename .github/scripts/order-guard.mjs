#!/usr/bin/env node
/**
 * db-apply's order guard: which migrations is production missing, and would
 * applying the named one land it out of order?
 *
 * This replaces an awk parser over `supabase migration list` text. That parser
 * matched a row shape the CLI no longer prints: on 2.115.0 it extracted ZERO
 * pending migrations while production was in fact missing ten, and the guard
 * then failed the run with "version ... is not pending" — the opposite of the
 * truth, and the failure mode a guard must never have. Measured on run
 * 34178071502.
 *
 * The ledger is authoritative and already available as JSON
 * (`supabase db query --linked --output-format json`), so nothing here parses
 * human-facing output. Pending = every migration file on disk whose version is
 * absent from supabase_migrations.schema_migrations.
 *
 * Usage:
 *   node .github/scripts/order-guard.mjs <ledger.json> <migrations-dir> \
 *     <want-version> <allow-out-of-order>
 */
import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function computePending(appliedVersions, migrationFilenames) {
  const applied = new Set(appliedVersions.map(String));
  return migrationFilenames
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .map((f) => f.slice(0, 14))
    .filter((v) => !applied.has(v))
    .sort();
}

export function olderThan(pending, want) {
  return pending.filter((v) => v < want);
}

function fail(message) {
  process.stdout.write(`::error::${message}\n`);
  process.exit(1);
}

function main() {
const [ledgerPath, migrationsDir, want, allowRaw] = process.argv.slice(2);
if (!ledgerPath || !migrationsDir || !want) {
  process.stderr.write('usage: order-guard.mjs <ledger.json> <migrations-dir> <want-version> <allow-out-of-order>\n');
  process.exit(2);
}
const allowOutOfOrder = allowRaw === 'true';

const parsed = JSON.parse(readFileSync(ledgerPath, 'utf-8'));
const rows = Array.isArray(parsed.rows) ? parsed.rows : null;
if (rows === null) {
  // An empty ledger is a legitimate answer; an UNREADABLE one is not, and must
  // never be silently treated as "nothing applied" — that would green-light
  // applying over a database whose real state we could not see.
  fail('could not read the production ledger: no rows array in the query result');
}

const pending = computePending(
  rows.map((r) => r.version),
  readdirSync(migrationsDir),
);

process.stdout.write(`Pending on production (only ${want} will be applied; the rest stay pending):\n`);
process.stdout.write(pending.length === 0 ? '  (none)\n' : pending.map((v) => `  ${v}\n`).join(''));

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    '### Pending migrations on production',
    pending.length === 0 ? '_none_' : ['```', ...pending, '```'].join('\n'),
    `_Only \`${want}\` is applied by this run._`,
    '',
  ].join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (!pending.includes(want)) {
  fail(`version ${want} is not pending — already applied, or not a migration file on this ref. Stopping.`);
}

// The apply sends ONE file, so a NEWER pending migration is simply untouched
// and needs no acknowledgement. An OLDER pending one does: applying past it
// lands this file out of order, and it is then skipped by any later
// `supabase db push` (which honours --include-all).
const older = olderThan(pending, want);
if (older.length > 0 && !allowOutOfOrder) {
  fail(
    `these OLDER migrations are still pending: ${older.join(' ')}. Applying ${want} now lands it out of ` +
      `order. Re-run with allow_out_of_order ticked only if ${want} does not depend on any of them.`,
  );
}
if (older.length > 0) {
  process.stdout.write(`Applying out of order, acknowledged: ${older.length} older migration(s) stay pending.\n`);
}
process.stdout.write('PASS order guard\n');
}

// Entrypoint guard: importing this module to test the pure helpers above must
// not run the guard (and exit(2) on missing argv).
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
