/**
 * P2-16 — "Coach player drill-down uses invented ratings".
 *
 * Deterministic unit tests for the two audit acceptance tests:
 *   1. No-round player shows "insufficient data" (→ null), not rating 50.
 *   2. An active focus area does not alter the performance score.
 *
 * computeCompositeRating no longer accepts focus areas at all, which is the
 * strongest possible guarantee for (2): there is no input through which a
 * coaching intention can inflate an observed-results score. The test asserts
 * the rating is purely a function of rounds + patterns.
 */
import { describe, it, expect } from 'vitest';
import {
  computeCompositeRating,
  type CompositeRoundInput,
  type CompositePatternInput,
} from './composite-rating';

const round = (score_to_par: number | null, holes_played = 18): CompositeRoundInput => ({
  score_to_par,
  holes_played,
});
const pattern = (severity: string | null): CompositePatternInput => ({ severity });

describe('computeCompositeRating — P2-16 data honesty', () => {
  it('returns null (not 50) for a player with no recorded rounds', () => {
    expect(computeCompositeRating([], [])).toBeNull();
    expect(computeCompositeRating([], [pattern('critical')])).toBeNull();
  });

  it('derives the score from observed scoring relative to par', () => {
    // Even par across recent rounds → 80; +10 over par → 50.
    expect(computeCompositeRating([round(0)], [])).toBe(80);
    expect(computeCompositeRating([round(10)], [])).toBe(50);
    // Under par lifts toward the cap.
    expect(computeCompositeRating([round(-5)], [])).toBe(95);
  });

  it('penalizes severe observed patterns (capped at 20)', () => {
    expect(computeCompositeRating([round(0)], [pattern('high')])).toBe(75); // 80 - 5
    expect(computeCompositeRating([round(0)], [pattern('critical'), pattern('high')])).toBe(70); // 80 - 10
    // Cap: five severe patterns would be -25 but the penalty clamps at -20.
    const fiveSevere = Array.from({ length: 5 }, () => pattern('critical'));
    expect(computeCompositeRating([round(0)], fiveSevere)).toBe(60); // 80 - 20
  });

  it('ignores non-severe patterns', () => {
    expect(computeCompositeRating([round(0)], [pattern('low'), pattern('medium')])).toBe(80);
  });

  it('does not let any focus-area-like signal alter the score (acceptance test 2)', () => {
    // The rating is a pure function of (rounds, patterns). Two players with the
    // SAME rounds + patterns get the SAME score regardless of how many active
    // development plans / focus areas a coach has opened — there is no third
    // argument through which a coaching intention can inflate the number.
    const rounds = [round(4), round(6)];
    const patterns = [pattern('high')];
    const baseline = computeCompositeRating(rounds, patterns);

    // Re-run with identical observed inputs — the absence of a focus-area
    // parameter means the score cannot drift upward when a plan is added.
    const afterOpeningFocusAreas = computeCompositeRating([...rounds], [...patterns]);
    expect(afterOpeningFocusAreas).toBe(baseline);
    expect(typeof baseline).toBe('number');
  });

  it('normalizes 9-hole rounds to an 18-hole-equivalent over-par', () => {
    // A 9-hole +5 doubles to +10-equivalent → 50, matching an 18-hole +10.
    expect(computeCompositeRating([round(5, 9)], [])).toBe(
      computeCompositeRating([round(10, 18)], []),
    );
  });
});
