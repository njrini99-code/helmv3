/**
 * The genome freshness formatter, shared by `GenomeDetailView` and
 * `GenomeCompareView`.
 *
 * Two things it fixes, one live and one latent — labelled, because the
 * difference matters:
 *
 *  LIVE. The compare surface had no freshness at all: the route dropped
 *  `computed_at` at the props boundary even though `loadGenomes` selects it.
 *  Production's newest genome was 41 days old on 2026-08-17, so a coach
 *  comparing two players to decide who travels saw six-week-old vectors with
 *  nothing saying so, while the single-player view for the same data said
 *  "last refreshed Jul 7, 2026".
 *
 *  LATENT. `formatAgo(null)` returned the string `'just now'`. All 51
 *  production rows carry a `computed_at`, so nothing has ever rendered it — but
 *  "unknown" must not be worded as "fresher than anything else on the page",
 *  and the compare surface adds a second caller that can legitimately pass null
 *  (a player with no genome).
 */
import { describe, it, expect } from 'vitest';
import { formatGenomeRefreshed } from '@/lib/coachhelm/v3/genome/format-refreshed';

const NOW = new Date('2026-08-17T12:00:00.000Z');

describe('formatGenomeRefreshed', () => {
  it('returns null for an unknown timestamp rather than inventing freshness', () => {
    expect(formatGenomeRefreshed(null, NOW)).toBeNull();
    expect(formatGenomeRefreshed(undefined, NOW)).toBeNull();
    expect(formatGenomeRefreshed('', NOW)).toBeNull();
  });

  it('returns null for an unparseable timestamp', () => {
    expect(formatGenomeRefreshed('not-a-date', NOW)).toBeNull();
  });

  it('words the recent cases in days', () => {
    expect(formatGenomeRefreshed('2026-08-17T02:00:00.000Z', NOW)).toBe('today');
    expect(formatGenomeRefreshed('2026-08-16T02:00:00.000Z', NOW)).toBe('yesterday');
    expect(formatGenomeRefreshed('2026-08-14T02:00:00.000Z', NOW)).toBe('3 days ago');
  });

  it('falls back to an absolute date past a week', () => {
    // The real production value: the newest genome across all 51 rows.
    expect(formatGenomeRefreshed('2026-07-07T08:12:00.000Z', NOW)).toBe('Jul 7, 2026');
  });

  it('formats that date in UTC, so server and client agree', () => {
    // 08:12Z is the previous calendar day in every zone west of Greenwich. A
    // bare toLocaleDateString would render "Jul 6, 2026" on a browser in New
    // York and "Jul 7, 2026" on the UTC server that produced the HTML — the
    // #418 hydration-mismatch class this codebase has already been bitten by on
    // the calendar. Pinning the zone is what makes this test pass under
    // Pacific/Midway as well as UTC.
    expect(formatGenomeRefreshed('2026-07-07T00:30:00.000Z', NOW)).toBe('Jul 7, 2026');
    expect(formatGenomeRefreshed('2026-07-07T23:30:00.000Z', NOW)).toBe('Jul 7, 2026');
  });

  it('never reports a future stamp as stale', () => {
    // Clock skew between the batch job's host and the reader's should read as
    // "today", not as a negative day count.
    expect(formatGenomeRefreshed('2026-08-18T02:00:00.000Z', NOW)).toBe('today');
  });
});
