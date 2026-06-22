/**
 * P2-20 — context-only composites must fire WITHOUT visible Tier-1 rows,
 * and lie/unit fixtures must fire the expected composites.
 *
 * These exercise the rule-level contract that `synthesizeForPlayer` relies on
 * after the early-return fix: the ctx-driven rules ignore `insights` entirely
 * and key off raw hole/shot context, so an empty insights array (the exact
 * condition that previously triggered the early return) must still let them
 * fire. The loaders are DB-coupled, so we test the pure detect()/compose()
 * surface plus the unit-normalization invariant the loader now enforces.
 */

import { describe, it, expect } from 'vitest';
import closingHoleFatigue from './rules/closing-hole-fatigue';
import front9Starter from './rules/front-9-starter';
import doublesAfterBogey from './rules/doubles-after-bogey';
import shortSideScrambling from './rules/short-side-scrambling-chain';
import type { CompositeContext, HoleScore, ShortGameShot } from './types';

const EMPTY_INSIGHTS: never[] = [];

/** Build a full 18-hole round with a per-hole to-par delta function. */
function round(roundId: string, toParAt: (hole: number) => number): HoleScore[] {
  return Array.from({ length: 18 }, (_, i) => {
    const hole = i + 1;
    const par = 4;
    return { round_id: roundId, hole_number: hole, par, score: par + toParAt(hole) };
  });
}

function ctx(partial: Partial<CompositeContext>): CompositeContext {
  return {
    hole_scores: [],
    short_game_shots: [],
    flyer_lie_shots: [],
    ...partial,
  };
}

describe('P2-20 · context-only composites fire with NO Tier-1 insights', () => {
  it('closing_hole_fatigue fires off ctx alone (empty insights)', () => {
    // 3 rounds where holes 13-18 play +1.0 to par worse than 1-12.
    const hole_scores = ['r1', 'r2', 'r3'].flatMap((id) =>
      round(id, (hole) => (hole >= 13 ? 1 : 0)),
    );
    const match = closingHoleFatigue.detect(EMPTY_INSIGHTS, ctx({ hole_scores }));
    expect(match).not.toBeNull();
    // Honest: no source insights — it is read from raw context.
    expect(match?.source_insight_ids).toEqual([]);
    expect(Number(match?.signals.delta)).toBeGreaterThanOrEqual(0.5);

    const composed = closingHoleFatigue.compose(match!);
    expect(composed.evidence.sample_n).toBe(3);
    expect(composed.evidence.metric).toBe('closing_hole_delta');
  });

  it('closing_hole_fatigue stays silent below the 3-round floor (honest)', () => {
    const hole_scores = round('only', (hole) => (hole >= 13 ? 1 : 0));
    expect(closingHoleFatigue.detect(EMPTY_INSIGHTS, ctx({ hole_scores }))).toBeNull();
  });

  it('front_9_starter fires off ctx alone (empty insights)', () => {
    // 3 rounds where the opening 3 holes play meaningfully over par.
    const hole_scores = ['r1', 'r2', 'r3'].flatMap((id) =>
      round(id, (hole) => (hole <= 3 ? 2 : 0)),
    );
    const match = front9Starter.detect(EMPTY_INSIGHTS, ctx({ hole_scores }));
    expect(match).not.toBeNull();
    expect(match?.source_insight_ids).toEqual([]);
  });

  it('doubles_after_bogey fires off ctx alone (empty insights)', () => {
    // Engineer a bogey→double cadence across 3 rounds: every odd hole a bogey
    // immediately followed by a double on the next hole.
    const hole_scores = ['r1', 'r2', 'r3'].flatMap((id) =>
      round(id, (hole) => (hole % 2 === 1 ? 1 : 2)),
    );
    const match = doublesAfterBogey.detect(EMPTY_INSIGHTS, ctx({ hole_scores }));
    expect(match).not.toBeNull();
    expect(match?.source_insight_ids).toEqual([]);
  });
});

describe('P2-20 · lie + unit fixtures fire the expected composite', () => {
  const sgShot = (over: Partial<ShortGameShot>): ShortGameShot => ({
    round_id: 'r1',
    hole_number: 5,
    lie_before: 'rough',
    distance_to_hole_before: 20, // yards from the green
    distance_to_hole_after: 20, // feet (default unit)
    distance_unit_after: 'feet',
    ...over,
  });

  it('short_side_scrambling fires for rough+sand lie vocab with poor leaves', () => {
    // 6 rough + 6 sand attempts, all leaving 20 ft (> 15 ft gate).
    const short_game_shots: ShortGameShot[] = [
      ...Array.from({ length: 6 }, () => sgShot({ lie_before: 'rough' })),
      ...Array.from({ length: 6 }, () => sgShot({ lie_before: 'sand' })),
    ];
    const match = shortSideScrambling.detect(EMPTY_INSIGHTS, ctx({ short_game_shots }));
    expect(match).not.toBeNull();
    // Canonical 'sand' (not legacy 'bunker') must be counted.
    expect(Number(match?.signals.bunker_pct)).toBeGreaterThan(0);
    expect(Number(match?.signals.rough_pct)).toBeGreaterThan(0);
  });

  it('short_side_scrambling normalizes yards leaves to feet before the gate', () => {
    // 12 attempts leaving "7 yards" (= 21 ft, over the 15 ft gate). If the rule
    // blended units it would read 7 < 15 and never fire — the ×3 conversion is
    // what makes it fire. Proves CANON: UNITS at the rule boundary.
    const short_game_shots: ShortGameShot[] = Array.from({ length: 12 }, () =>
      sgShot({ distance_to_hole_after: 7, distance_unit_after: 'yards' }),
    );
    const match = shortSideScrambling.detect(EMPTY_INSIGHTS, ctx({ short_game_shots }));
    expect(match).not.toBeNull();
    expect(Number(match?.signals.avg_proximity)).toBeCloseTo(21, 5);
  });

  it('does NOT fire when leaves are tight (avg <= 15 ft) — honest no-op', () => {
    const short_game_shots: ShortGameShot[] = Array.from({ length: 12 }, () =>
      sgShot({ distance_to_hole_after: 8, distance_unit_after: 'feet' }),
    );
    expect(shortSideScrambling.detect(EMPTY_INSIGHTS, ctx({ short_game_shots }))).toBeNull();
  });
});
