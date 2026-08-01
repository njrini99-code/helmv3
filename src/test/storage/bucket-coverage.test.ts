import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every storage bucket the app uploads to must be created by a migration.
 *
 * WHY THIS EXISTS. `supabase.storage.from('nope').upload(...)` does not fail at
 * build time, at type-check time, or in any test that mocks the storage client.
 * It fails in production with "Bucket not found", and in this codebase the
 * calling actions turn that into a generic user-facing string — "Failed to
 * upload receipt." — so the real cause never reaches a log a human reads.
 *
 * Measured 2026-08-01: six bucket names appear in src/, and three of them did
 * not exist in production. One was `golf-attachments`, behind the attachment
 * button in golf messaging — a live, shipped feature that could never once have
 * worked. Nothing in CI could notice, because CI has no production credentials
 * and every test double accepts any bucket name.
 *
 * This is a STATIC cross-check: bucket names used in src/ vs buckets created by
 * any migration. Like the realtime publication test next door, it proves intent
 * is recorded in migrations, NOT that the migration has been applied — this
 * repo has a documented history of migrations recorded but never run, so
 * `npm run db:drift:check` remains the check for applied-vs-recorded.
 */

/** `.storage.from('x')`, tolerating a newline between the two calls. */
const STORAGE_FROM_RE = /\.storage[\s\S]{0,40}?\.from\(\s*['"]([a-z0-9_-]+)['"]/g;
/** `export const STORAGE_BUCKET = 'x'` and friends. */
const BUCKET_CONST_RE = /(?:STORAGE_BUCKET|BUCKET_NAME|BUCKET_ID)\s*(?::\s*string)?\s*=\s*['"]([a-z0-9_-]+)['"]/g;

/**
 * Referenced in src/ but deliberately not created by a migration yet, each
 * with the issue that owns the decision. Anything NOT on this list must have a
 * migration — that is the point of the test.
 *
 * Remove an entry when its bucket gets a migration; the test then enforces it.
 */
const KNOWN_MISSING: Record<string, string> = {
  // #1173 — note the underscore. No bucket in this project uses underscores,
  // and neither `baseball_videos` nor `baseball-videos` exists, so the intended
  // name is genuinely unknown and guessing it would be worse than failing.
  baseball_videos: '#1173',
  // Blocked on a product decision, not a missing migration: the upload calls
  // getPublicUrl() and persists the result to golf_travel_expenses.receipt_url,
  // so a private bucket needs the read path to sign on demand, and a public one
  // makes every financial receipt readable by anyone holding the URL.
  'expense-receipts': '#1179',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(p);
    }
  }
  return out;
}

function bucketsUsedInSrc(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(join(process.cwd(), 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(STORAGE_FROM_RE)) if (m[1]) found.add(m[1]);
    for (const m of src.matchAll(BUCKET_CONST_RE)) if (m[1]) found.add(m[1]);
  }
  return found;
}

/** Buckets any migration creates, via `INSERT INTO storage.buckets`. */
function bucketsCreatedByMigrations(): Set<string> {
  const dir = join(process.cwd(), 'supabase/migrations');
  const created = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, f), 'utf8');
    if (!sql.includes('storage.buckets')) continue;
    // Take the id from the VALUES list of an INSERT INTO storage.buckets.
    for (const ins of sql.matchAll(
      /INSERT\s+INTO\s+storage\.buckets[\s\S]{0,400}?VALUES\s*\(\s*'([a-z0-9_-]+)'/gi,
    )) {
      if (ins[1]) created.add(ins[1]);
    }
  }
  return created;
}

describe('storage bucket coverage', () => {
  it('every bucket used in src/ is created by a migration', () => {
    const used = bucketsUsedInSrc();
    const created = bucketsCreatedByMigrations();

    // Non-vacuity: if either scanner silently stops matching — a refactor to a
    // helper, a formatting change that breaks the regex — this fails loudly
    // rather than passing over two empty sets.
    expect(used.size).toBeGreaterThanOrEqual(5);
    expect(created.size).toBeGreaterThanOrEqual(5);

    const missing = [...used]
      .filter((b) => !created.has(b))
      .filter((b) => !(b in KNOWN_MISSING))
      .sort();

    expect(missing).toEqual([]);
  });

  it('the known-missing allowlist has not gone stale', () => {
    const used = bucketsUsedInSrc();
    const created = bucketsCreatedByMigrations();

    // An allowlisted bucket that is now created by a migration, or no longer
    // referenced at all, should be removed from the list — otherwise the list
    // quietly grants an exemption nobody is relying on any more.
    const stale = Object.keys(KNOWN_MISSING)
      .filter((b) => created.has(b) || !used.has(b))
      .sort();

    expect(stale).toEqual([]);
  });
});
