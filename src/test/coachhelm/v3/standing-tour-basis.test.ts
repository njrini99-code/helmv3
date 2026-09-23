import { describe, it, expect } from 'vitest';

import {
  STANDING_TOUR_BASIS_MISMATCH,
  applyTourBasis,
  isStandingTourComparable,
} from '@/lib/coachhelm/v3/standing/tour-basis';
import { applyGenderAnchor } from '@/lib/coachhelm/v3/standing/gender-anchor';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

/**
 * Addendum A2, read level: the approach-proximity standing rows carry an
 * on-green-only player value against the Tour's all-shot figure. No reader
 * may draw that as a comparison.
 */

function row(overrides: Partial<PlayerStanding> = {}): PlayerStanding {
  return {
    player_id: 'p1',
    metric_id: 'approach_proximity_125_175ft',
    player_value: 22.6, // on-green leave, ft
    team_avg: 24.1,
    team_n: 7,
    team_pct: 60,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 30, // Tour all-shot proximity, ft
    pga_delta: -7.4,
    computed_at: '2026-09-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('isStandingTourComparable', () => {
  it('names exactly the three approach-proximity ids as non-comparable', () => {
    expect([...STANDING_TOUR_BASIS_MISMATCH].sort()).toEqual([
      'approach_proximity_125_175ft',
      'approach_proximity_175_plus_ft',
      'approach_proximity_50_125ft',
    ]);
    for (const id of STANDING_TOUR_BASIS_MISMATCH) {
      expect(isStandingTourComparable(id)).toBe(false);
    }
  });

  it('every other registry metric keeps its Tour comparison', () => {
    for (const id of ['gir_pct', 'scrambling_pct_sand', 'putts_made_5_10ft_pct', 'sg_approach', 'big_number_rate']) {
      expect(isStandingTourComparable(id)).toBe(true);
    }
  });
});

describe('applyTourBasis', () => {
  it('stamps the omission + reason on an approach-proximity row and keeps the team tick', () => {
    const s = applyTourBasis(row());
    expect(s.pga_omitted).toBe(true);
    expect(s.pga_omitted_reason).toBe('basis_mismatch');
    // Team comparison is like-for-like (teammates are on the same on-green basis).
    expect(s.team_avg).toBe(24.1);
    expect(s.team_n).toBe(7);
    // The raw Tour value is left on the row — pga_omitted is the render truth.
    expect(s.pga_value).toBe(30);
  });

  it('returns a comparable row unchanged — same reference, no flag', () => {
    const r = row({ metric_id: 'scrambling_pct_sand', player_value: 40, pga_value: 50, pga_delta: -10 });
    const s = applyTourBasis(r);
    expect(s).toBe(r);
    expect(s.pga_omitted).toBeUndefined();
  });

  it('does not overwrite a gender omission that already carries its own reason', () => {
    const womens = applyGenderAnchor(row({ metric_id: 'big_number_rate', pga_value: 2 }), 'womens');
    expect(womens.pga_omitted).toBe(true);
    expect(womens.pga_omitted_reason).toBe('no_womens_anchor');
    const s = applyTourBasis(womens);
    expect(s.pga_omitted_reason).toBe('no_womens_anchor');
  });

  it('a women\'s approach row is omitted for basis even after the LPGA anchor is applied', () => {
    // The gender anchor swaps the men's 30 for the LPGA figure — still an
    // all-shot number against an on-green player value. Basis rule wins.
    const lpga = new Map([
      ['approach_proximity_125_175ft', { metric_id: 'approach_proximity_125_175ft', pga_tour_value: 38 }],
    ]) as unknown as Parameters<typeof applyGenderAnchor>[2];
    const anchored = applyGenderAnchor(row(), 'womens', lpga);
    expect(anchored.pga_omitted).toBe(false);
    expect(anchored.pga_value).toBe(38);
    const s = applyTourBasis(anchored);
    expect(s.pga_omitted).toBe(true);
    expect(s.pga_omitted_reason).toBe('basis_mismatch');
    expect(s.is_womens).toBe(true);
  });
});
