import { describe, it, expect } from 'vitest';
import { computeEngagementScore, engagementBand } from '@/lib/admin/data/user-engagement';

const now = new Date('2026-07-02T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

describe('computeEngagementScore', () => {
  it('is 0 with no activity at all', () => {
    expect(
      computeEngagementScore(
        { lastActivityIso: null, rounds30d: 0, insightsEngaged30d: 0, reviewsViewed30d: 0 },
        now,
      ),
    ).toBe(0);
  });

  it('is 100 for a maximally-engaged user (active today, 5+ rounds, 3+ insights, 3+ reviews)', () => {
    expect(
      computeEngagementScore(
        { lastActivityIso: now.toISOString(), rounds30d: 8, insightsEngaged30d: 5, reviewsViewed30d: 5 },
        now,
      ),
    ).toBe(100);
  });

  it('recency decays linearly to 0 over 30 days', () => {
    const at15d = computeEngagementScore(
      { lastActivityIso: daysAgo(15), rounds30d: 0, insightsEngaged30d: 0, reviewsViewed30d: 0 },
      now,
    );
    expect(at15d).toBe(20); // half of the 40-pt recency bucket
    const at30d = computeEngagementScore(
      { lastActivityIso: daysAgo(30), rounds30d: 0, insightsEngaged30d: 0, reviewsViewed30d: 0 },
      now,
    );
    expect(at30d).toBe(0);
  });

  it('caps each bucket rather than rewarding unbounded volume', () => {
    const capped = computeEngagementScore(
      { lastActivityIso: null, rounds30d: 999, insightsEngaged30d: 999, reviewsViewed30d: 999 },
      now,
    );
    expect(capped).toBe(30 + 15 + 15); // 60 — recency bucket is 0 with no last activity
  });

  it('never goes negative or above 100', () => {
    const score = computeEngagementScore(
      { lastActivityIso: daysAgo(400), rounds30d: -5, insightsEngaged30d: -5, reviewsViewed30d: -5 },
      now,
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('engagementBand', () => {
  it('bands scores into strong / steady / fading / dormant', () => {
    expect(engagementBand(90)).toBe('strong');
    expect(engagementBand(75)).toBe('strong');
    expect(engagementBand(60)).toBe('steady');
    expect(engagementBand(45)).toBe('steady');
    expect(engagementBand(30)).toBe('fading');
    expect(engagementBand(20)).toBe('fading');
    expect(engagementBand(5)).toBe('dormant');
    expect(engagementBand(0)).toBe('dormant');
  });
});
