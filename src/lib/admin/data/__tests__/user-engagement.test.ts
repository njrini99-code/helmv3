import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

/**
 * Bridge audit 2026-08-21 (Finding 6): `insightsEngaged30d`'s own doc comment
 * defines it as "5 pts/insight engaged (delivered-to or acted-on)", but the
 * query that filled it (both the player branch and the coach branch) counted
 * every insight GENERATED in the window, with no filter on `acknowledged_at`
 * or `action_taken` — the codebase already used `acknowledged_at IS NOT
 * NULL` correctly for the team-level "Acknowledged %" stat two files over
 * (team-page-extras.ts), this per-user field just never got the same filter.
 * Live-checked: every one of the platform's 15 most-recently-insighted
 * players had 0 acknowledged — this wasn't a corner case, it was universal.
 * `computeEngagementScore` itself is unchanged (still pure, still tested
 * above); this is a source-text guard on the query that feeds it, since
 * `fetchUserEngagement` fans out across ~10 parallel Supabase reads and
 * isn't separately exported for isolated mocking.
 */
describe('fetchUserEngagement — insightsEngaged30d counts acknowledged/acted-on, not merely generated', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/admin/data/user-engagement.ts'),
    'utf8',
  );

  it('filters golf_coach_insights by acknowledged_at OR action_taken', () => {
    const occurrences = src.split('acknowledged_at.not.is.null,action_taken.eq.true').length - 1;
    // Once for the player branch, once for the coach branch — a count check
    // (not just presence) so a fix that only reached one branch still fails.
    expect(occurrences).toBe(2);
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
