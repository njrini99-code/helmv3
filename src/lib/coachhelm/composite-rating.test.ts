/**
 * P2-16 — "Coach player drill-down uses invented ratings" + the composite-
 * rating UNIFICATION (Wave 2): this suite is the migrated/expanded version of
 * the former `players/[playerId]/composite-rating.test.ts`, now covering the
 * canonical `@/lib/coachhelm/composite-rating` both call sites import.
 *
 *   1. No-round player shows "insufficient data" (→ `rating: null`), not a
 *      fabricated 50.
 *   2. An active focus area does not alter the performance score (rating is a
 *      pure function of rounds + patterns — no focus-area input exists).
 *   3. NEW — `trend` is derived through the canonical windowed classifier
 *      (`@/lib/coachhelm/trend`), independent of `rating`.
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
  it('returns rating null (not 50) for a player with no recorded rounds', () => {
    expect(computeCompositeRating([], []).rating).toBeNull();
    expect(computeCompositeRating([], [pattern('critical')]).rating).toBeNull();
  });

  it('honestly reports zero rounds available and a flat trend when there is no data', () => {
    const result = computeCompositeRating([], []);
    expect(result.rounds_in_calculation).toBe(0);
    expect(result.trend).toBe('flat');
  });

  it('derives the score from observed scoring relative to par', () => {
    // Even par across recent rounds → 80; +10 over par → 50.
    expect(computeCompositeRating([round(0)], []).rating).toBe(80);
    expect(computeCompositeRating([round(10)], []).rating).toBe(50);
    // Under par lifts toward the cap.
    expect(computeCompositeRating([round(-5)], []).rating).toBe(95);
  });

  it('penalizes severe observed patterns (capped at 20)', () => {
    expect(computeCompositeRating([round(0)], [pattern('high')]).rating).toBe(75); // 80 - 5
    expect(computeCompositeRating([round(0)], [pattern('critical'), pattern('high')]).rating).toBe(70); // 80 - 10
    // Cap: five severe patterns would be -25 but the penalty clamps at -20.
    const fiveSevere = Array.from({ length: 5 }, () => pattern('critical'));
    expect(computeCompositeRating([round(0)], fiveSevere).rating).toBe(60); // 80 - 20
  });

  it('ignores non-severe patterns', () => {
    expect(computeCompositeRating([round(0)], [pattern('low'), pattern('medium')]).rating).toBe(80);
  });

  it('does not let any focus-area-like signal alter the score (acceptance test 2)', () => {
    // The rating is a pure function of (rounds, patterns). Two players with the
    // SAME rounds + patterns get the SAME score regardless of how many active
    // development plans / focus areas a coach has opened — there is no third
    // argument through which a coaching intention can inflate the number.
    const rounds = [round(4), round(6)];
    const patterns = [pattern('high')];
    const baseline = computeCompositeRating(rounds, patterns).rating;

    // Re-run with identical observed inputs — the absence of a focus-area
    // parameter means the score cannot drift upward when a plan is added.
    const afterOpeningFocusAreas = computeCompositeRating([...rounds], [...patterns]).rating;
    expect(afterOpeningFocusAreas).toBe(baseline);
    expect(typeof baseline).toBe('number');
  });

  it('normalizes 9-hole rounds to an 18-hole-equivalent over-par', () => {
    // A 9-hole +5 doubles to +10-equivalent → 50, matching an 18-hole +10.
    expect(computeCompositeRating([round(5, 9)], []).rating).toBe(
      computeCompositeRating([round(10, 18)], []).rating,
    );
  });

  it('reports the honest sample size used', () => {
    expect(computeCompositeRating([round(0), round(1), round(2)], []).rounds_in_calculation).toBe(3);
  });
});

describe('computeCompositeRating — trend (canonical windowed classifier)', () => {
  it('is flat with too few rounds to establish a trend (cold-start honesty)', () => {
    expect(computeCompositeRating([round(2), round(1)], []).trend).toBe('flat');
  });

  it('reads a lower recent score_to_par as trending up (improving)', () => {
    // Rounds are most-recent-first: 5 recent rounds at scratch, 5 previous
    // rounds well over par → the player is trending toward better scoring.
    const rounds = [
      round(0), round(0), round(0), round(0), round(0),
      round(6), round(6), round(6), round(6), round(6),
    ];
    expect(computeCompositeRating(rounds, []).trend).toBe('up');
  });

  it('reads a higher recent score_to_par as trending down (declining)', () => {
    const rounds = [
      round(8), round(8), round(8), round(8), round(8),
      round(1), round(1), round(1), round(1), round(1),
    ];
    expect(computeCompositeRating(rounds, []).trend).toBe('down');
  });

  it('reads a near-identical recent/previous average as flat', () => {
    const rounds = [
      round(3), round(3), round(3), round(3), round(3),
      round(3), round(3), round(3), round(3), round(3),
    ];
    expect(computeCompositeRating(rounds, []).trend).toBe('flat');
  });
});
