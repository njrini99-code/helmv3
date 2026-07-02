import { describe, it, expect } from 'vitest';
import { computeBannerState, isSignalStale, classifyKpiTone } from '@/lib/admin/data/overview';

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
