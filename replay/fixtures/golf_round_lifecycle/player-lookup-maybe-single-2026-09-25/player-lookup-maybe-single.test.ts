import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A signed-in user without a golf_players row is an expected case, not an error.
 *
 * `.single()` reports a zero-row match as PGRST116 ("Cannot coerce the result
 * to a single JSON object"). Every call site below already answers a missing
 * row with its own message (`if (!player) return ...`) and never reads the
 * error, but the Supabase/Sentry instrumentation still records the PGRST116 as
 * an exception. That produced Sentry JAVASCRIPT-NEXTJS-SZ (34 events on
 * POST /golf/dashboard/rounds/continue/[id], 2026-09-07..2026-09-15) and the
 * reliability signal rel:72be7f89, after bdc09c915 had converted the first 8
 * sites in golf.ts and left these behind.
 *
 * `.maybeSingle()` returns `{ data: null, error: null }` for zero rows (and
 * still errors on >1), so the callers' behaviour is unchanged and the false
 * exception disappears.
 */

const ROOT = process.cwd();

// file → number of golf_players-by-user_id lookups that must use maybeSingle
const FILES: Record<string, number> = {
  'src/app/golf/actions/round-drafts.ts': 3,
  'src/app/golf/actions/communication.ts': 2,
  'src/app/golf/actions/announcements.ts': 1,
};

// The former src/app/golf/actions/golf.ts, split by domain (plan phase 7a).
const GOLF_TS_SPLIT_FILES = [
  'src/app/golf/actions/round-submit.ts',
  'src/app/golf/actions/round-partial.ts',
  'src/app/golf/actions/shot-actions.ts',
  'src/app/golf/actions/qualifier-actions.ts',
  'src/app/golf/actions/saved-courses.ts',
  'src/app/golf/actions/calendar-events.ts',
  'src/app/golf/actions/calendar-notifications.ts',
  'src/app/golf/actions/calendar-blocked-time.ts',
  'src/app/golf/actions/team-management.ts',
  'src/app/golf/actions/golf-action-shared.ts',
];

// .from('golf_players').select('id').eq('user_id', user.id).<terminal>()
const LOOKUP =
  /\.from\('golf_players'\)\s*\.select\('id'\)\s*\.eq\('user_id',\s*user\.id\)\s*\.(single|maybeSingle)\(\)/g;

function terminals(file: string): string[] {
  const src = readFileSync(join(ROOT, file), 'utf8');
  return [...src.matchAll(LOOKUP)].map((m) => m[1] ?? '');
}

describe('golf_players lookup by user_id treats "no profile" as data, not an error', () => {
  for (const [file, expected] of Object.entries(FILES)) {
    it(`${file} uses .maybeSingle() for every player lookup`, () => {
      const found = terminals(file);
      expect(found.length).toBe(expected);
      expect(found.filter((t) => t === 'single')).toEqual([]);
    });
  }

  it('the former golf.ts action files (split by domain) use .maybeSingle() for player lookups', () => {
    const found = GOLF_TS_SPLIT_FILES.flatMap((file) => terminals(file));
    // respondToEvent (and stats.ts) keep `.single()` deliberately: they branch
    // on PGRST116 to tell "no profile" from a failed read.
    expect(found.filter((t) => t === 'single').length).toBeLessThanOrEqual(1);
  });
});
