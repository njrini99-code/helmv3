/**
 * Bridge audit 2026-08-21: three roster sources in entity-thread.ts
 * (sources.golf_roster, sources.baseball_roster, sources.roster) each
 * unconditionally returned `hitCap: false`, unlike every other source in the
 * file, which correctly computes `rows.length >= LIMIT`. For any entity with
 * more roster/staff rows than ROSTER_LIMIT=100, the overflow was silently
 * dropped without ever setting `truncated` — the thread looked complete when
 * it wasn't. Currently dormant (live max team size is 15 members / 3 staff,
 * well under 100), but wrong on its face regardless of today's data size.
 *
 * A source-text guard, not a mock-based render test: `fetchEntityThread`
 * fans out to dozens of parallel Supabase reads across ~30 sources, and
 * these three closures aren't separately exported — extracting them purely
 * to unit-test hitCap in isolation would be a much larger refactor than the
 * bug warrants. This guard is the fast, direct way to pin the fix and catch
 * a regression back to the hardcoded shape (matches the established
 * convention in team-error-counts.test.ts for this class of admin-data bug).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_PATH = path.join(process.cwd(), 'src/lib/admin/data/entity-thread.ts');

describe('entity-thread roster sources compute hitCap instead of hardcoding it', () => {
  it('no source unconditionally returns hitCap: false', () => {
    const src = fs.readFileSync(SRC_PATH, 'utf8');
    expect(src).not.toContain('hitCap: false');
  });

  it('golf_roster and baseball_roster OR the cap across both of their sub-queries', () => {
    const src = fs.readFileSync(SRC_PATH, 'utf8');
    // Each of these sources issues two independently-capped queries (roster
    // membership + coaching staff); the fix must check both, not just one.
    const golfMatches = src.match(/if \(\(data \?\? \[\]\)\.length >= ROSTER_LIMIT\) hitCap = true;/g) ?? [];
    expect(golfMatches.length).toBeGreaterThanOrEqual(4); // 2 in golf_roster + 2 in baseball_roster
  });

  it('the team roster source checks the raw fetched-row count against ROSTER_LIMIT', () => {
    const src = fs.readFileSync(SRC_PATH, 'utf8');
    expect(src).toContain('hitCap: rows.length >= ROSTER_LIMIT');
  });
});
