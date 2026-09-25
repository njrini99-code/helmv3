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

// .from('golf_players').select('id').eq('user_id', user.id).<terminal>()
const LOOKUP =
  /\.from\('golf_players'\)\s*\.select\('id'\)\s*\.eq\('user_id',\s*user\.id\)\s*\.(single|maybeSingle)\(\)/g;

function terminals(file: string): string[] {
  const src = readFileSync(join(ROOT, file), 'utf8');
  return [...src.matchAll(LOOKUP)].map((m) => m[1]);
}

describe('golf_players lookup by user_id treats "no profile" as data, not an error', () => {
  for (const [file, expected] of Object.entries(FILES)) {
    it(`${file} uses .maybeSingle() for every player lookup`, () => {
      const found = terminals(file);
      expect(found.length).toBe(expected);
      expect(found.filter((t) => t === 'single')).toEqual([]);
    });
  }

  it('golf.ts saved-course player lookups use .maybeSingle()', () => {
    const found = terminals('src/app/golf/actions/golf.ts');
    // respondToEvent (and stats.ts) keep `.single()` deliberately: they branch
    // on PGRST116 to tell "no profile" from a failed read.
    expect(found.filter((t) => t === 'single').length).toBeLessThanOrEqual(1);
  });
});
