/**
 * ============================================================================
 * FairwayPlayerInsight — formatRelativeDate, no internal clock read
 * ----------------------------------------------------------------------------
 * `formatRelativeDate` used to have no `now` parameter and read `new Date()`
 * directly, so its "Started N days ago" / "Due N days ago" labels depended
 * on the ambient wall clock at call time — a server render and the client's
 * first paint (evaluated moments apart) could disagree (React #418). The fix
 * makes `now: Date | null` a required parameter with no internal clock read.
 *
 * Mounting the full `FairwayPlayerInsight` component for this would require
 * a large fixture (PlayerProfile, CategoryBreakdown, TrendSummary, rounds,
 * patterns, focus areas, predictions, themes) plus router/context mocking,
 * none of which this helper's own correctness depends on — so this targets
 * the pure function directly, the same way time-format.test.ts covers
 * `relativeTimeFrom`/`fullDateTime`. `formatRelativeDate` was exported
 * (previously module-private) solely to make this test possible; no
 * behavior changed.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { formatRelativeDate } from './FairwayPlayerInsight';

describe('formatRelativeDate', () => {
  it('is pure: identical (dateStr, now) inputs produce identical output regardless of the real system clock', () => {
    const dateStr = '2026-08-20T12:00:00.000Z';
    const now = new Date('2026-08-22T12:00:00.000Z');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
    const first = formatRelativeDate(dateStr, now);

    vi.setSystemTime(new Date('2030-06-15T00:00:00.000Z'));
    const second = formatRelativeDate(dateStr, now);
    vi.useRealTimers();

    expect(second).toBe(first);
    expect(first).toBe('2 days ago');
  });

  it('buckets today/yesterday/days/weeks/months correctly', () => {
    const base = new Date('2026-08-22T12:00:00.000Z');
    const daysAgo = (n: number) => new Date(base.getTime() - n * 86_400_000).toISOString();

    expect(formatRelativeDate(daysAgo(0), base)).toBe('Today');
    expect(formatRelativeDate(daysAgo(1), base)).toBe('Yesterday');
    expect(formatRelativeDate(daysAgo(3), base)).toBe('3 days ago');
    expect(formatRelativeDate(daysAgo(14), base)).toBe('2 weeks ago');
    expect(formatRelativeDate(daysAgo(60), base)).toBe('2 months ago');
  });

  it('falls back to an absolute short date (never a relative guess) when now is null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
    const first = formatRelativeDate('2026-08-20T12:00:00.000Z', null);

    vi.setSystemTime(new Date('2030-06-15T00:00:00.000Z'));
    const second = formatRelativeDate('2026-08-20T12:00:00.000Z', null);
    vi.useRealTimers();

    expect(second).toBe(first);
    expect(first).not.toBe('');
  });
});
