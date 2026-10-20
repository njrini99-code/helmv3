import { describe, expect, it } from 'vitest';
import { attemptCounterfactual, feetOf, impactOf, per18, primaryTeamId, welchZ, windowOf, yardsOf } from '../angle-data';

describe('attemptCounterfactual', () => {
  it('sizes strokes per attempt × the player\'s own attempts per round', () => {
    const cf = attemptCounterfactual({ strokesPerAttempt: 0.2, attemptsPerRound: 5, baseline: 75, weeks: 8 });
    expect(cf.strokes_saved_per_round).toBe(1);
    expect(cf.attempts_used).toBe(5);
    expect(cf.suppressed).toBe(false);
    expect(cf.projected_score_if_closed).toBe(74);
    expect(impactOf(cf)).toBe(1);
  });

  it('clamps to 2.5 strokes a round', () => {
    const cf = attemptCounterfactual({ strokesPerAttempt: 1, attemptsPerRound: 9, baseline: 75, weeks: 8 });
    expect(cf.strokes_saved_per_round).toBe(2.5);
    expect(cf.clamped).toBe(true);
  });

  it('suppresses below the 0.3 noise floor and with no gap', () => {
    const small = attemptCounterfactual({ strokesPerAttempt: 0.05, attemptsPerRound: 4, baseline: 75, weeks: 8 });
    expect(small.suppressed).toBe(true);
    expect(small.suppress_reason).toBe('below_threshold');
    expect(impactOf(small)).toBe(0);
    const none = attemptCounterfactual({ strokesPerAttempt: -0.2, attemptsPerRound: 4, baseline: 75, weeks: 8 });
    expect(none.suppress_reason).toBe('no_gap');
  });

  it('keeps the sized strokes when only the scoring baseline is missing', () => {
    const cf = attemptCounterfactual({ strokesPerAttempt: 0.2, attemptsPerRound: 5, baseline: null, weeks: 8 });
    expect(cf.suppress_reason).toBe('no_baseline');
    expect(impactOf(cf)).toBe(1);
  });
});

describe('helpers', () => {
  it('units: feet vs yards in both directions', () => {
    expect(yardsOf(300, 'feet')).toBe(100);
    expect(yardsOf(150, 'yards')).toBe(150);
    expect(feetOf(10, 'yards')).toBe(30);
    expect(feetOf(12, 'feet')).toBe(12);
    expect(feetOf(null, 'feet')).toBeNull();
  });

  it('per18 doubles a 9-hole value', () => {
    expect(per18(3, 9)).toBe(6);
    expect(per18(3, 18)).toBe(3);
  });

  it('windowOf spans the round dates inclusively', () => {
    expect(windowOf([{ date: '2026-03-10' }, { date: '2026-03-01' }])).toEqual({
      window_start: '2026-03-01',
      window_end: '2026-03-10',
      window_days: 10,
    });
  });

  it('welchZ is positive when the first sample is higher', () => {
    expect(welchZ([2, 3, 4, 3], [0, 1, 0, 1])!).toBeGreaterThan(3);
    expect(welchZ([1], [0, 1])).toBeNull();
  });

  it('primaryTeamId picks the most frequent team', () => {
    expect(primaryTeamId([{ team_id: 'a' }, { team_id: 'b' }, { team_id: 'b' }, { team_id: null }])).toBe('b');
    expect(primaryTeamId([{ team_id: null }])).toBeNull();
  });
});
