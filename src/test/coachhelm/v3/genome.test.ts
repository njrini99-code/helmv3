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
