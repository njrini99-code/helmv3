/**
 * check-migration-versions.mjs
 *
 * Guards against DUPLICATE Supabase migration version prefixes.
 *
 * Supabase tracks applied migrations in supabase_migrations.schema_migrations,
 * keyed on the `version` string — the leading timestamp segment of the filename
 * (everything before the first underscore). Two files that share the same
 * version prefix are a real migration-integrity hazard:
 *
 *   - `supabase db push` / `supabase migration repair` can error on the
 *     ambiguous version, or
 *   - only ONE version row gets recorded, so the second file is silently
 *     skipped on fresh environments and never re-applied — leaving prod and
 *     CI/preview databases structurally divergent.
 *
 * Idempotent (`IF NOT EXISTS`) bodies MASK this locally because re-running the
 * winning file is a no-op, but the loser's objects never get created on a clean
 * apply. This guard makes the hazard a hard CI failure instead of a latent bug.
 *
 * It additionally enforces strictly-increasing, well-formed version prefixes so
 * the apply order stays deterministic.
 *
 * Usage (CLI):
 *   node scripts/check-migration-versions.mjs
 *
 * Exits 0 if every migration has a unique, well-formed version prefix.
 * Exits 1 (and prints offenders to stderr) on any duplicate or malformed
 * version. Exits 2 on an I/O failure reading the migrations directory.
 */

import { readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Extract the version prefix (leading timestamp before the first underscore)
 * from a migration filename.
 *
 * @param {string} filename - e.g. "20260624000220_baseball_passport.sql"
 * @returns {string} the version prefix, e.g. "20260624000220"
 */
export function versionOf(filename) {
  return filename.split('_')[0];
}

/**
 * Pure analyzer — no I/O, no side effects.
 *
 * @param {string[]} files - Migration filenames (".sql" only, in any order)
 * @returns {{
 *   duplicates: { version: string, files: string[] }[],
 *   malformed: string[],
 * }}
 *   - duplicates: version prefixes shared by 2+ files, with the offending
 *     filenames (sorted) for each.
 *   - malformed: filenames whose version prefix is not a 14-digit timestamp.
 *     (All real migrations in this repo use the YYYYMMDDHHMMSS 14-digit form.)
 */
export function analyzeMigrationVersions(files) {
  const byVersion = new Map();
  const malformed = [];

  for (const file of files) {
    const version = versionOf(file);

    // Every migration version must be a 14-digit timestamp (YYYYMMDDHHMMSS).
    // A non-conforming prefix breaks deterministic lexicographic ordering and
    // is almost always a typo (e.g. a missing or extra digit).
    if (!/^\d{14}$/.test(version)) {
      malformed.push(file);
    }

    const bucket = byVersion.get(version);
    if (bucket) {
      bucket.push(file);
    } else {
      byVersion.set(version, [file]);
    }
  }

  const duplicates = [];
  for (const [version, bucketFiles] of byVersion) {
    if (bucketFiles.length > 1) {
      duplicates.push({ version, files: [...bucketFiles].sort() });
    }
  }
  // Stable, readable output: order duplicate groups by version.
  duplicates.sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
  malformed.sort();

  return { duplicates, malformed };
}

// CLI entrypoint — only runs when this file is executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(__dirname, '..', 'supabase', 'migrations');

  let files;
  try {
    const entries = await readdir(migrationsDir);
    files = entries.filter((f) => f.endsWith('.sql'));
  } catch (err) {
    process.stderr.write(
      `check-migration-versions: failed to read ${migrationsDir}: ${err?.message ?? err}\n`,
    );
    process.exit(2);
  }

  const { duplicates, malformed } = analyzeMigrationVersions(files);

  if (duplicates.length === 0 && malformed.length === 0) {
    process.stdout.write(
      `Migration versions OK — ${files.length} files, all unique 14-digit prefixes.\n`,
    );
    process.exit(0);
  }

  if (duplicates.length > 0) {
    process.stderr.write('Duplicate Supabase migration version prefix(es) detected:\n');
    for (const { version, files: dupFiles } of duplicates) {
      process.stderr.write(`  ${version}\n`);
      for (const f of dupFiles) process.stderr.write(`    - ${f}\n`);
    }
    process.stderr.write(
      '\nTwo files cannot share a version prefix — Supabase keys the migration\n' +
        'ledger on it, so one file would be skipped on a clean apply. Rename the\n' +
        'later file to the next free, strictly-increasing 14-digit version.\n',
    );
  }

  if (malformed.length > 0) {
    process.stderr.write('\nMalformed migration version prefix(es) (expected 14-digit YYYYMMDDHHMMSS):\n');
    for (const f of malformed) process.stderr.write(`  - ${f}\n`);
  }

  process.exit(1);
}
