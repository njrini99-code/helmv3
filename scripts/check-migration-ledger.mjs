/**
 * check-migration-ledger.mjs
 *
 * Reconciles on-disk Supabase migration files against the live migration
 * ledger (supabase_migrations.schema_migrations).
 *
 * Usage: run it with no stdin and it prints the exact psql invocation. That
 * text lives in the `usage` string below and is deliberately NOT repeated
 * here — a second copy is a second place to rot.
 *
 * Exits 0 if in sync, 1 with a diff on stderr if not, and 2 for a usage
 * error (no pipe, empty stdin, or unparseable JSON). Exit 2 is NOT a
 * verdict about the ledger — it means the check never ran.
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
  //
  // This is a FILTER, not a standalone command. The ledger lives in the
  // database and this script holds no credentials of its own, so run with no
  // pipe there is simply nothing to reconcile against. That is a usage error,
  // not an out-of-sync ledger — but until now both exited 2 with the single
  // line "failed to parse ledger JSON from stdin", which reads like a corrupt
  // ledger and sends the reader to look at the database. Same exit code, three
  // different causes, one misleading message.
  const usage = [
    'check-migration-ledger reconciles supabase/migrations/*.sql against the',
    'live migration ledger. It reads that ledger as JSON on STDIN and has no',
    'database credentials of its own, so it cannot run standalone.',
    '',
    'Pipe the ledger in:',
    '',
    '  psql "$DATABASE_URL" -Atc \\',
    `    "select json_agg(json_build_object('version',version,'name',name)) \\`,
    '     from supabase_migrations.schema_migrations" \\',
    '    | node scripts/check-migration-ledger.mjs',
    '',
    `Currently ${files.length} migration file(s) on disk.`,
  ].join('\n');

  // No pipe at all. Under a bare `npm run check:ledger` npm may or may not
  // hand through the TTY, so the empty-input branch below covers the same
  // mistake when it does not — both land on the usage text rather than on a
  // parse error.
  if (process.stdin.isTTY) {
    process.stderr.write(`check-migration-ledger: no ledger on stdin.\n\n${usage}\n`);
    process.exit(2);
  }

  const raw = await new Response(process.stdin).text();

  if (raw.trim() === '') {
    process.stderr.write(
      `check-migration-ledger: stdin was empty — nothing to reconcile against.\n\n${usage}\n`
    );
    process.exit(2);
  }

  let ledger;
  try {
    const parsed = JSON.parse(raw);
    // Supabase returns null when the table is empty (json_agg of 0 rows).
    ledger = Array.isArray(parsed) ? parsed : [];
  } catch {
    process.stderr.write(
      `check-migration-ledger: stdin was not valid JSON (${raw.length} bytes read).\n` +
        'Expected a json_agg array of {version, name} rows.\n\n' +
        `${usage}\n`
    );
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
