// =============================================================================
// Every storage bucket the APP uses must be created by a TRACKED migration.
//
// WHY THIS EXISTS — the second instance of one class, found by sweeping for it.
//
// The active baseline `20260527000000_prod_public_baseline.sql` is a
// PUBLIC-SCHEMA-ONLY dump: its first DDL is `CREATE SCHEMA IF NOT EXISTS "public"`
// and it emits nothing for `auth`, `storage`, `cron` or `realtime`. So NOTHING in
// those schemas could ever have been captured by it, and anything created through
// the Supabase dashboard rather than a migration lives only in production.
//
// The first instance was the `on_auth_user_created` trigger on `auth.users`
// (20260730020000) — signup silently failed to create the `public.users` row on
// any database built from migrations. Sweeping for the class turned up a second:
// production has 8 storage buckets, and `avatars` was created 2026-03-06 and
// tracked nowhere, along with its 4 `storage.objects` policies (23 of production's
// 27 storage policies were tracked; the avatar ones were the gap).
//
// `avatars` is on the ONBOARDING path — `avatar-upload.tsx` defaults to it and
// AvatarUpload renders in golf coach onboarding, golf player onboarding and
// Fairway settings — so avatar upload failed on every local stack and preview
// branch. Fixed by 20260730030000.
//
// WHAT THIS TEST PINS, AND WHY THAT SHAPE. It does not hardcode production's
// bucket list, which would rot the moment a bucket is added. It derives the list
// from the SOURCE — every bucket the app actually addresses — and requires each
// one to be created by a tracked migration. That is the invariant that matters: a
// bucket the app writes to and migrations do not create is a database the app
// cannot run against.
//
// It is a source-text test on purpose. A database test cannot catch a missing
// storage object, because it runs against the database that is missing it — which
// is exactly why the pgTAP suites never saw either instance of this.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const SRC_DIR = join(REPO_ROOT, 'src');

/** Buckets referenced as `supabase.storage.from('<id>')`. */
const STORAGE_FROM = /storage\s*\.\s*from\(\s*['"`]([a-z0-9][a-z0-9._-]*)['"`]/g;
/** Buckets referenced as a `bucket:` / `bucket =` option, incl. prop defaults. */
const BUCKET_OPTION = /\bbucket\s*[:=]\s*['"`]([a-z0-9][a-z0-9._-]*)['"`]/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function bucketsReferencedInSource(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(SRC_DIR)) {
    // Tests mock storage with throwaway names; they address no real bucket.
    if (/(^|[\\/])(__tests__|test)[\\/]/.test(file) || /\.(test|spec)\.tsx?$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const re of [STORAGE_FROM, BUCKET_OPTION]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const id = m[1];
        if (!id) continue;
        const rel = file.slice(REPO_ROOT.length + 1);
        const at = found.get(id) ?? [];
        if (!at.includes(rel)) at.push(rel);
        found.set(id, at);
      }
    }
  }
  return found;
}

function migrationsBlob(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');
}

/**
 * Buckets the app addresses that no migration creates — AND that production does
 * not have either. These are worse than untracked: the feature has never worked
 * anywhere.
 *
 * Verified against production 2026-07-30 by read-only SQL: neither bucket exists
 * in `storage.buckets`, `storage.objects` holds zero rows for either id, and both
 * backing tables are empty (`golf_message_attachments` 0, `golf_travel_expenses`
 * 0). So these are broken-and-unused, not users-hitting-errors — nobody has ever
 * successfully attached a file or a receipt.
 *
 * Both upload paths are genuinely reachable, checked past the import (an import is
 * not a render):
 *   - `expense-receipts` ← uploadExpenseReceipt ← FairwayExpenseForm.tsx:164,
 *     rendered by FairwayTravel.tsx:478
 *   - `golf-attachments` ← sendGolfMessageWithAttachments ←
 *     use-message-attachments.ts ← FairwayMessages.tsx:117
 *
 * NOT FIXED HERE, deliberately. Unlike `avatars` — where production already had
 * the bucket and its policies, so the migration could be a faithful, no-op-on-prod
 * copy — creating these two means designing NEW RLS for a shared production
 * database: conversation-membership scoping for attachments, team-staff scoping for
 * receipts (which also needs `public = true`, since the code calls
 * `getPublicUrl`). Hand-written RLS on this database has already produced two
 * recursion cycles and five anon-callable functions in this run, none of which was
 * visible to reading. That belongs in a deliberate reviewed pass, not a 2am sweep.
 *
 * UPDATE 2026-08-01: `golf-attachments` got that deliberate pass and is now
 * created by `20260801080000_golf_attachments_storage_bucket.sql`, so its line is
 * gone from the list below. Its policies scope SELECT/INSERT to conversation
 * membership through the existing `user_conversation_ids()` helper and UPDATE/
 * DELETE to `owner`, mirroring the app's sender-only delete rule.
 *
 * `expense-receipts` stays, and the reason above is exactly why: it is not a
 * missing-bucket problem alone. The code calls `getPublicUrl()` and persists the
 * result to `golf_travel_expenses.receipt_url`, which FairwayExpenseList renders
 * later — so a private bucket needs the read path to sign on demand, and a public
 * one makes every financial receipt readable by anyone holding the URL. Product
 * decision, tracked in #1179.
 *
 * Keyed on bucket id. Fixing one means deleting its line — enforced by the
 * stale-entry test below, so this list cannot quietly outlive the defect.
 */
const KNOWN_MISSING_BUCKETS = new Set<string>([
  'expense-receipts',
]);

describe('storage buckets the app uses are created by tracked migrations', () => {
  const referenced = bucketsReferencedInSource();
  const blob = migrationsBlob();

  it('finds bucket references in the source at all (guards a vacuous pass)', () => {
    // If the walk or the regexes break, `referenced` goes empty and every
    // assertion below passes without checking anything. Pin the precondition.
    expect(
      [...referenced.keys()].length,
      'No storage bucket references found in src/ — the detector is broken, not the code',
    ).toBeGreaterThanOrEqual(4);
  });

  /** True when some migration inserts this bucket id into storage.buckets. */
  function isTracked(id: string): boolean {
    return (
      /INSERT\s+INTO\s+storage\.buckets/i.test(blob) &&
      new RegExp(`['"]${id.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}['"]`).test(blob)
    );
  }

  it('creates every referenced bucket in a tracked migration', () => {
    const untracked: string[] = [];
    for (const [id, files] of referenced) {
      if (KNOWN_MISSING_BUCKETS.has(id)) continue;
      if (!isTracked(id)) untracked.push(`${id}  (used by ${files.join(', ')})`);
    }

    expect(
      untracked,
      'These storage buckets are addressed by the app but created by NO tracked ' +
        'migration. Production may have them (created via the dashboard), but any ' +
        'database built from supabase/migrations/ — supabase start, a preview ' +
        'branch, a restore drill — will not, and every upload to them fails there. ' +
        'The 2026-05-27 baseline is a public-schema-only dump and cannot carry ' +
        'storage objects; they have to be added by an explicit migration. ' +
        'Do NOT add an entry to KNOWN_MISSING_BUCKETS to make this pass — that list ' +
        'is for buckets production does not have either, each with its evidence.',
    ).toEqual([]);
  });

  it('keeps KNOWN_MISSING_BUCKETS free of stale entries', () => {
    // Fixing a bucket must force its line out of the list, or the list becomes a
    // record of what used to be broken and stops meaning anything.
    const stale = [...KNOWN_MISSING_BUCKETS].filter(
      (id) => isTracked(id) || !referenced.has(id),
    );
    expect(
      stale,
      'These KNOWN_MISSING_BUCKETS entries are now tracked by a migration, or are ' +
        'no longer referenced by the app at all. Delete their lines.',
    ).toEqual([]);
  });

  it('gives the avatars bucket RLS policies, not just a bucket row', () => {
    // A public bucket with no INSERT policy is not usable: the upload is denied.
    // This was the actual production/local divergence, so it is pinned by name.
    for (const policy of [
      'Avatars accessible to authenticated',
      'Users can upload their own avatar',
      'Users can update their own avatar',
      'Users can delete their own avatar',
    ]) {
      expect(blob, `missing storage.objects policy: ${policy}`).toContain(policy);
    }
  });
});
