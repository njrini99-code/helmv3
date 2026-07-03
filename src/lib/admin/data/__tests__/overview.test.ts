import { describe, it, expect } from 'vitest';
import { computeBannerState, isSignalStale, classifyKpiTone, isoStartOfToday } from '@/lib/admin/data/overview';

describe('computeBannerState', () => {
  it('critical wins over everything', () => {
    expect(computeBannerState({ criticalCount: 2, attentionCount: 5, anyFeedStale: true }))
      .toEqual({ state: 'critical', attentionCount: 7 });
  });
  it('attention when non-critical items exist', () => {
    expect(computeBannerState({ criticalCount: 0, attentionCount: 3, anyFeedStale: false }))
      .toEqual({ state: 'attention', attentionCount: 3 });
  });
  it('stale beats nominal — a silent dashboard is not a healthy one', () => {
    expect(computeBannerState({ criticalCount: 0, attentionCount: 0, anyFeedStale: true }))
      .toEqual({ state: 'stale', attentionCount: 0 });
  });
  it('nominal only when zero items AND feeds fresh', () => {
    expect(computeBannerState({ criticalCount: 0, attentionCount: 0, anyFeedStale: false }))
      .toEqual({ state: 'nominal', attentionCount: 0 });
  });
});

describe('isSignalStale', () => {
  const now = new Date('2026-07-01T12:00:00Z');
  it('flags a signal past its window (no login rows in 24h = logging broke)', () => {
    expect(isSignalStale({ label: 'login events', lastSeenAt: '2026-06-30T10:00:00Z', staleAfterHours: 24 }, now)).toBe(true);
  });
  it('passes a fresh signal', () => {
    expect(isSignalStale({ label: 'login events', lastSeenAt: '2026-07-01T09:00:00Z', staleAfterHours: 24 }, now)).toBe(false);
  });
  it('treats never-seen as stale', () => {
    expect(isSignalStale({ label: 'cron outcomes', lastSeenAt: null, staleAfterHours: 26 }, now)).toBe(true);
  });
});

describe('isoStartOfToday', () => {
  // Regression: previously used `new Date(); d.setHours(0,0,0,0)` — the
  // process's LOCAL timezone — while the Activity tab's isoStartOfUtcDay
  // (src/app/admin/activity/_data.ts) deliberately uses Date.UTC so "today"
  // is deterministic regardless of runtime TZ. These assertions read only
  // getUTCFullYear/Month/Date off the input, so they hold no matter what
  // timezone the test runner's host is in.
  it('returns UTC midnight for the given instant, not local midnight', () => {
    const now = new Date('2026-07-03T23:30:00.000Z'); // 11:30pm UTC
    expect(isoStartOfToday(now)).toBe('2026-07-03T00:00:00.000Z');
  });

  it('rolls over exactly at UTC midnight, not at any local-timezone midnight', () => {
    const justBeforeUtcMidnight = new Date('2026-07-03T23:59:59.999Z');
    const justAfterUtcMidnight = new Date('2026-07-04T00:00:00.000Z');
    expect(isoStartOfToday(justBeforeUtcMidnight)).toBe('2026-07-03T00:00:00.000Z');
    expect(isoStartOfToday(justAfterUtcMidnight)).toBe('2026-07-04T00:00:00.000Z');
  });

  it('defaults to the current instant when no `now` is passed', () => {
    const expected = new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    )).toISOString();
    expect(isoStartOfToday()).toBe(expected);
  });
});

describe('classifyKpiTone', () => {
  it('zero is calm — neutral', () => {
    expect(classifyKpiTone(0, 10)).toBe('neutral');
  });
  it('any occurrence below the red line is amber', () => {
    expect(classifyKpiTone(1, 10)).toBe('warning');
    expect(classifyKpiTone(9, 10)).toBe('warning');
  });
  it('at or past the red line is danger', () => {
    expect(classifyKpiTone(10, 10)).toBe('danger');
    expect(classifyKpiTone(50, 10)).toBe('danger');
  });
});
