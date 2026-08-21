import { describe, it, expect } from 'vitest';
import { isBriefingStuckRound } from '../OverviewBriefing';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('isBriefingStuckRound', () => {
  const now = Date.now();

  it('is false for a completed round even if idle for a long time', () => {
    expect(
      isBriefingStuckRound({ total_score: 72, created_at: new Date(now - 90 * DAY).toISOString() }, now)
    ).toBe(false);
  });

  it('is false for a round idle under 2h', () => {
    expect(
      isBriefingStuckRound({ total_score: null, created_at: new Date(now - HOUR).toISOString() }, now)
    ).toBe(false);
  });

  it('is true for a no-score round idle between 2h and 48h', () => {
    expect(
      isBriefingStuckRound({ total_score: null, created_at: new Date(now - 10 * HOUR).toISOString() }, now)
    ).toBe(true);
  });

  it('is false for a no-score round idle 3 weeks — abandoned, not stuck', () => {
    expect(
      isBriefingStuckRound({ total_score: null, created_at: new Date(now - 21 * DAY).toISOString() }, now)
    ).toBe(false);
  });
});
