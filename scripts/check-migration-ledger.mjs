/**
 * check-migration-ledger.mjs
 *
 * Reconciles on-disk Supabase migration files against the live migration
 * ledger (supabase_migrations.schema_migrations).
 *
 * Usage (CLI):
 *   psql "$DATABASE_URL" -Atc \
 *     "select json_agg(json_build_object('version',version,'name',name)) from supabase_migrations.schema_migrations" \
 *     | node scripts/check-migration-ledger.mjs
 *
 * Exits 0 if in sync, exits 1 and prints a diff to stderr if not.
 */

import { readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pure reconciliation function — no I/O, no side effects.
 *
 * @param {string[]} files   - Migration filenames (e.g. ["20260518123207_fix_crm.sql"])
 * @param {{ version: string, name: string }[]} ledger - Ledger rows from DB
 * @returns {{ missingFromLedger: string[], missingFromDisk: { version: string, name: string }[] }}
 */
export function reconcile(files, ledger) {
  // Build a Set of versions that exist on disk.
  // A filename's version is the leading YYYYMMDDHHMMSS segment (before the first _).
  const diskVersions = new Set(
    files.map((f) => f.split('_')[0])
  );

  // Build a Set of versions that exist in the ledger.
  const ledgerVersions = new Set(ledger.map((row) => row.version));

  // Files on disk whose version isn't in the ledger.
  const missingFromLedger = files.filter((f) => !ledgerVersions.has(f.split('_')[0]));

  // Ledger entries whose version isn't on disk.
  const missingFromDisk = ledger.filter((row) => !diskVersions.has(row.version));

  return { missingFromLedger, missingFromDisk };
}

// CLI entrypoint — only runs when this file is executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(__dirname, '..', 'supabase', 'migrations');

  // Read on-disk filenames.
  let files;
  try {
    const entries = await readdir(migrationsDir);
    files = entries.filter((f) => f.endsWith('.sql')).sort();
  } catch {
    // If the directory doesn't exist, treat as empty.
    files = [];
  }

  // Read ledger JSON from stdin.
  let ledger;
  try {
    const raw = await new Response(process.stdin).text();
    const parsed = JSON.parse(raw);
    // Supabase returns null when the table is empty (json_agg of 0 rows).
    ledger = Array.isArray(parsed) ? parsed : [];
  } catch {
    process.stderr.write('check-migration-ledger: failed to parse ledger JSON from stdin\n');
    process.exit(2);
  }

  const { missingFromLedger, missingFromDisk } = reconcile(files, ledger);

  if (missingFromLedger.length > 0 || missingFromDisk.length > 0) {
    process.stderr.write('Ledger out of sync:\n');
    process.stderr.write(
      JSON.stringify({ missingFromLedger, missingFromDisk }, null, 2) + '\n'
    );
    process.exit(1);
  }

  process.stdout.write('Migration ledger in sync.\n');
  process.exit(0);
}
