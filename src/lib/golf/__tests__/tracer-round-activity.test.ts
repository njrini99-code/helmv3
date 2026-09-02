import { describe, it, expect } from 'vitest';
import { classifyInProgressActivity } from '../tracer-round-activity';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('classifyInProgressActivity', () => {
  const now = new Date('2026-08-20T12:00:00.000Z').getTime();

  it('classifies a round idle less than an hour as in_progress', () => {
    const updatedAt = new Date(now - 30 * 60 * 1000).toISOString();
    expect(classifyInProgressActivity(updatedAt, now)).toBe('round_in_progress');
  });

  it('classifies a round idle 1h+ but under the stuck-tier bound as stuck', () => {
    const updatedAt = new Date(now - 2 * HOUR).toISOString(); // halted 2h ago
    expect(classifyInProgressActivity(updatedAt, now)).toBe('round_stuck');
  });

  it('classifies a round idle well past the stuck-tier bound as abandoned, not stuck', () => {
    // The reported scenario: a round touched once, never resumed. Recently
    // updated enough to still be in the 30-day window, but idle far longer
    // than the "recently active" bound.
    const updatedAt = new Date(now - 10 * DAY).toISOString();
    expect(classifyInProgressActivity(updatedAt, now)).toBe('round_abandoned');
  });

  // Bridge audit 2026-08-21: PR #1559's original fix gated the loud tier on
  // `createdAt` (created within the last 7 days) instead of idle duration.
  // Verified against production: 3 of 10 live in-progress rounds, all
  // created within the last 6 days but idle 88-133 hours, still tiered
  // "stuck" under that rule. These three cases pin the fix — idle duration
  // alone now decides the tier, regardless of how recently the round was
  // created.
  it('a round idle 88h (created recently) is abandoned, not stuck — the audited regression', () => {
    const updatedAt = new Date(now - 88 * HOUR).toISOString();
    expect(classifyInProgressActivity(updatedAt, now)).toBe('round_abandoned');
  });

  it('a round idle 89h (created recently) is abandoned, not stuck', () => {
    const updatedAt = new Date(now - 89 * HOUR).toISOString();
    expect(classifyInProgressActivity(updatedAt, now)).toBe('round_abandoned');
  });

  it('a round idle 133h (created recently) is abandoned, not stuck', () => {
    const updatedAt = new Date(now - 133 * HOUR).toISOString();
    expect(classifyInProgressActivity(updatedAt, now)).toBe('round_abandoned');
  });

  it('a round idle 23h (genuinely just halted) stays stuck', () => {
    const updatedAt = new Date(now - 23 * HOUR).toISOString();
    expect(classifyInProgressActivity(updatedAt, now)).toBe('round_stuck');
  });

  it('returns null outside the 30-day recency window regardless of tier', () => {
    const updatedAt = new Date(now - 31 * DAY).toISOString();
    expect(classifyInProgressActivity(updatedAt, now)).toBeNull();
  });

  it('is inclusive at exactly the 1h stuck-vs-in-progress boundary', () => {
    const updatedAt = new Date(now - HOUR).toISOString();
    expect(classifyInProgressActivity(updatedAt, now)).toBe('round_stuck');
  });

  it('is exclusive at exactly the stuck-tier-max-idle boundary (24h) — falls to abandoned', () => {
    const updatedAt = new Date(now - 24 * HOUR).toISOString();
    expect(classifyInProgressActivity(updatedAt, now)).toBe('round_abandoned');
  });

  it('stays stuck just under the stuck-tier-max-idle boundary', () => {
    const updatedAt = new Date(now - (24 * HOUR - 1)).toISOString();
    expect(classifyInProgressActivity(updatedAt, now)).toBe('round_stuck');
  });
});
