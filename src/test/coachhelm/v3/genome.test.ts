/**
 * W33-pt1 — genome framework + miss_side_bias dimension.
 *
 * Orchestrator + endpoint hit Supabase, so we don't unit-test the
 * persistence path here. The dimension itself is pure — gets full
 * coverage with synthetic shot fixtures.
 */

import { describe, it, expect } from 'vitest';
import missSideBias from '@/lib/coachhelm/v3/genome/dimensions/miss-side-bias';
import { GENOME_DIMENSIONS, getDimension } from '@/lib/coachhelm/v3/genome/registry';
import type { GenomeContext, GenomeShot } from '@/lib/coachhelm/v3/genome/types';

function shot(over: Partial<GenomeShot> = {}): GenomeShot {
  return {
    round_id: over.round_id ?? 'r1',
    hole_number: over.hole_number ?? 5,
    shot_type: over.shot_type ?? 'approach',
    club_type: over.club_type ?? 'non_driver',
    lie_before: over.lie_before ?? 'fairway',
    lie_after: over.lie_after ?? 'green',
    distance_to_hole_before: over.distance_to_hole_before ?? 150,
    distance_to_hole_after: over.distance_to_hole_after ?? 25,
    miss_direction: over.miss_direction ?? null,
    is_penalty: over.is_penalty ?? false,
  };
}

function ctx(overrides: Partial<GenomeContext> = {}): GenomeContext {
  return {
    player_id: 'p-1',
    recent_rounds_count: overrides.recent_rounds_count ?? 10,
    rounds: overrides.rounds ?? [],
    hole_scores: overrides.hole_scores ?? [],
    shots: overrides.shots ?? [],
  };
}

// ---------------------------------------------------------------------------
// Registry sanity
// ---------------------------------------------------------------------------

describe('genome registry', () => {
  it('exports an immutable array of dimensions', () => {
    expect(GENOME_DIMENSIONS.length).toBeGreaterThan(0);
  });

  it('every dimension has unique id + valid category', () => {
    const ids = new Set<string>();
    const validCategories = new Set([
      'miss_tendencies', 'pressure_response', 'recovery_patterns',
      'course_type_affinity', 'weather_sensitivity', 'stamina',
      'learning_velocity', 'strategic_profile',
    ]);
    for (const d of GENOME_DIMENSIONS) {
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
      expect(validCategories.has(d.category)).toBe(true);
    }
  });

  it('getDimension finds known dim, returns undefined for missing', () => {
    expect(getDimension('miss_side_bias')?.id).toBe('miss_side_bias');
    expect(getDimension('does_not_exist')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// miss_side_bias
// ---------------------------------------------------------------------------

describe('miss_side_bias dimension', () => {
  it('returns null when fewer than 30 directional approaches', () => {
    const shots = Array.from({ length: 10 }, () =>
      shot({ shot_type: 'approach', miss_direction: 'left' }),
    );
    const r = missSideBias.compute(ctx({ shots }));
    expect(r.value).toBeNull();
    expect(r.confidence).toBeNull();
  });

  it('computes -1 when all misses are left', () => {
    const shots = Array.from({ length: 35 }, () =>
      shot({ miss_direction: 'left' }),
    );
    const r = missSideBias.compute(ctx({ shots }));
    expect(r.value).toBe(-1);
    expect(r.label).toBe('Left bias');
  });

  it('computes +1 when all misses are right', () => {
    const shots = Array.from({ length: 35 }, () =>
      shot({ miss_direction: 'right' }),
    );
    const r = missSideBias.compute(ctx({ shots }));
    expect(r.value).toBe(1);
    expect(r.label).toBe('Right bias');
  });

  it('returns ~0 for symmetric misses + labels Symmetric', () => {
    const shots = [
      ...Array.from({ length: 18 }, () => shot({ miss_direction: 'left' })),
      ...Array.from({ length: 18 }, () => shot({ miss_direction: 'right' })),
    ];
    const r = missSideBias.compute(ctx({ shots }));
    expect(r.value).toBe(0);
    expect(r.label).toBe('Symmetric');
  });

  it('ignores non-approach shots even if they have miss_direction', () => {
    const shots = [
      ...Array.from({ length: 35 }, () =>
        shot({ shot_type: 'tee', miss_direction: 'left' }),
      ),
      ...Array.from({ length: 30 }, () =>
        shot({ shot_type: 'approach', miss_direction: 'right' }),
      ),
    ];
    const r = missSideBias.compute(ctx({ shots }));
    expect(r.value).toBe(1); // all approach misses are right
  });

  it('confidence grows with sample size, capped at 1', () => {
    const small = missSideBias.compute(
      ctx({
        shots: Array.from({ length: 30 }, () =>
          shot({ miss_direction: 'left' }),
        ),
      }),
    );
    const huge = missSideBias.compute(
      ctx({
        shots: Array.from({ length: 200 }, () =>
          shot({ miss_direction: 'left' }),
        ),
      }),
    );
    expect(small.confidence).toBeLessThan(1);
    expect(huge.confidence).toBe(1);
  });
});

/**
 * `miss_direction` is an EIGHT-value compass, not a two-value side.
 *
 * Production carries `left, right, short, long, short_left, short_right,
 * long_left, long_right`. This dimension filtered on bare `'left'`/`'right'`
 * only, so every compound value — which still names a side — was discarded.
 *
 * Measured 2026-08-17 over the genome's own 90-day window:
 *
 *   approach shots with a miss_direction        1,701
 *   counted by the dimension (bare left/right)    417
 *   carrying a side once compounds count        1,001
 *   pure short/long, correctly excluded either way 700
 *
 * So 58% of the side-carrying signal was thrown away, and the dimension went
 * dark for 10 of the 13 players who actually have enough data — only 3 cleared
 * the 30-shot floor.
 *
 * Worse than sparse: the surviving 40% subsample points the WRONG WAY for
 * several players who DO clear the floor today —
 *
 *   Owen Carter    bare +0.059 (right)  ->  full -0.030 (left)   n=34 today
 *   Tyler Hayes    bare +0.048 (right)  ->  full -0.048 (left)   n=32 today
 *   Dylan Brooks   bare -0.043 (left)   ->  full +0.121 (right)
 *
 * A coach reading "misses left" off the radar would have the player working on
 * the opposite fault.
 *
 * Same shape as the `'heavy_rough'/'light_rough'/'bunker'` literals this
 * codebase already found matching zero rows in scrambling: a filter written
 * against an imagined value vocabulary rather than the one production emits.
 *
 * The existing assertions above are untouched — they use bare left/right and
 * still hold. These only add the compound cases.
 */
describe('miss_side_bias — compound compass values carry a side', () => {
  it('counts short_left and long_left as left misses', () => {
    const shots = [
      ...Array.from({ length: 18 }, () => shot({ miss_direction: 'short_left' })),
      ...Array.from({ length: 17 }, () => shot({ miss_direction: 'long_left' })),
    ];
    const r = missSideBias.compute(ctx({ shots }));
    expect(r.value).toBe(-1);
    expect(r.label).toBe('Left bias');
  });

  it('counts short_right and long_right as right misses', () => {
    const shots = [
      ...Array.from({ length: 18 }, () => shot({ miss_direction: 'short_right' })),
      ...Array.from({ length: 17 }, () => shot({ miss_direction: 'long_right' })),
    ];
    const r = missSideBias.compute(ctx({ shots }));
    expect(r.value).toBe(1);
    expect(r.label).toBe('Right bias');
  });

  it('still excludes pure short and long, which name no side', () => {
    const shots = [
      ...Array.from({ length: 40 }, () => shot({ miss_direction: 'short' })),
      ...Array.from({ length: 40 }, () => shot({ miss_direction: 'long' })),
    ];
    // No side-carrying misses at all -> below the floor -> null, not 0.
    expect(missSideBias.compute(ctx({ shots })).value).toBeNull();
  });

  it('does not let the bare-value subsample invert the real bias', () => {
    // Owen Carter's shape: the bare left/right subsample leans RIGHT while the
    // full side-carrying set leans LEFT. Before the fix this returned +1.
    const shots = [
      ...Array.from({ length: 20 }, () => shot({ miss_direction: 'right' })),
      ...Array.from({ length: 40 }, () => shot({ miss_direction: 'short_left' })),
    ];
    const r = missSideBias.compute(ctx({ shots }));
    expect(r.value).toBeLessThan(0);
    expect(r.label).toBe('Left bias');
  });

  it('reaches the sample floor on compound values alone', () => {
    // 30 compound misses is a real sample. Before the fix this was null,
    // which is how the dimension went dark for 10 of 13 eligible players.
    const shots = Array.from({ length: 30 }, () => shot({ miss_direction: 'long_right' }));
    expect(missSideBias.compute(ctx({ shots })).value).not.toBeNull();
  });
});
