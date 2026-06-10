import { describe, it, expect } from 'vitest';

import {
  applyGenderAnchor,
  applyGenderAnchorToMap,
} from '@/lib/coachhelm/v3/standing/gender-anchor';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

/**
 * Build a raw standing row as the DB pipeline produces it: pga_value is ALWAYS
 * the men's golf_pga_standards Tour value, regardless of the player's gender.
 */
function rawStanding(overrides: Partial<PlayerStanding> = {}): PlayerStanding {
  return {
    player_id: 'grace',
    metric_id: 'scrambling_pct_sand',
    player_value: 0,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 50, // men's Tour sand-save (the bug: rendered to women too)
    pga_delta: -50,
    computed_at: '2026-06-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('applyGenderAnchor — P1 women get the women\'s anchor', () => {
  it('overrides pga_value with the women\'s sand-save anchor (38, not the men\'s 50)', () => {
    const s = applyGenderAnchor(rawStanding({ player_value: 0 }), 'womens');
    // The headline bug from insight 994ee861: bar said 50%, prose said 38%.
    expect(s.pga_value).toBe(38);
    expect(s.pga_omitted).toBe(false);
  });

  it('recomputes pga_delta against the women\'s anchor', () => {
    const s = applyGenderAnchor(rawStanding({ player_value: 30 }), 'womens');
    // player_value - womens_anchor = 30 - 38 = -8 (was 30 - 50 = -20 in the DB row)
    expect(s.pga_delta).toBe(-8);
  });

  it('applies to every metric that carries a women\'s anchor (putts, approach, gir)', () => {
    const putt = applyGenderAnchor(
      rawStanding({ metric_id: 'putts_made_5_10ft_pct', player_value: 50, pga_value: 62.2 }),
      'womens',
    );
    expect(putt.pga_value).toBe(52); // women's 5-10ft make target, not men's 62.2

    const approach = applyGenderAnchor(
      rawStanding({ metric_id: 'approach_proximity_125_175ft', player_value: 60, pga_value: 65 }),
      'womens',
    );
    expect(approach.pga_value).toBe(56); // women's green-hit band, not men's 65

    const gir = applyGenderAnchor(
      rawStanding({ metric_id: 'gir_pct', player_value: 55, pga_value: 66 }),
      'womens',
    );
    expect(gir.pga_value).toBe(60); // women's GIR, not men's 66
  });
});

describe('applyGenderAnchor — men / unknown are unchanged (no behavior change)', () => {
  it('returns the men\'s row byte-for-byte for gender=mens (same reference)', () => {
    const raw = rawStanding();
    const s = applyGenderAnchor(raw, 'mens');
    expect(s).toBe(raw); // identity — no override, no pga_omitted flag
    expect(s.pga_value).toBe(50);
    expect(s.pga_omitted).toBeUndefined();
  });

  it('never sets pga_omitted for a men\'s player, even on an anchorless metric', () => {
    const s = applyGenderAnchor(
      rawStanding({ metric_id: 'big_number_rate', pga_value: 2 }),
      'mens',
    );
    expect(s.pga_value).toBe(2);
    expect(s.pga_omitted).toBeUndefined();
  });
});

describe('applyGenderAnchor — P3 missing women\'s anchor → omit, never fabricate', () => {
  it('flags course_management metrics for omission (no credible women\'s baseline)', () => {
    const big = applyGenderAnchor(
      rawStanding({ metric_id: 'big_number_rate', player_value: 8, pga_value: 2 }),
      'womens',
    );
    expect(big.pga_omitted).toBe(true);
    // pga_value/pga_delta are left as-is; pga_omitted is the render source of truth.
    expect(big.pga_value).toBe(2);

    const pen = applyGenderAnchor(
      rawStanding({ metric_id: 'penalty_rate_per_round', player_value: 1, pga_value: 0.3 }),
      'womens',
    );
    expect(pen.pga_omitted).toBe(true);
  });

  it('flags par-type scoring metrics for omission for women', () => {
    for (const metric of ['scoring_par_3', 'scoring_par_4', 'scoring_par_5'] as MetricId[]) {
      const s = applyGenderAnchor(rawStanding({ metric_id: metric }), 'womens');
      expect(s.pga_omitted).toBe(true);
    }
  });
});

describe('applyGenderAnchor — is_womens flag (LPGA label wire-up)', () => {
  it('stamps is_womens on a women\'s row WITH an anchor (label reads "LPGA")', () => {
    const s = applyGenderAnchor(rawStanding({ metric_id: 'scrambling_pct_sand' }), 'womens');
    expect(s.is_womens).toBe(true);
    expect(s.pga_omitted).toBe(false);
  });

  it('stamps is_womens on a women\'s row WITHOUT an anchor (pga_omitted path)', () => {
    const s = applyGenderAnchor(rawStanding({ metric_id: 'big_number_rate' }), 'womens');
    expect(s.pga_omitted).toBe(true);
    expect(s.is_womens).toBe(true);
  });

  it('never stamps is_womens on a men\'s row (PGA label unchanged)', () => {
    const s = applyGenderAnchor(rawStanding(), 'mens');
    expect(s.is_womens).toBeUndefined();
  });
});

describe('applyGenderAnchorToMap', () => {
  it('rewrites every row for a women\'s player and leaves a men\'s map untouched', () => {
    const map = new Map<MetricId, PlayerStanding>([
      ['scrambling_pct_sand', rawStanding({ metric_id: 'scrambling_pct_sand', pga_value: 50 })],
      ['big_number_rate', rawStanding({ metric_id: 'big_number_rate', pga_value: 2 })],
    ]);

    const womens = applyGenderAnchorToMap(map, 'womens');
    expect(womens.get('scrambling_pct_sand')!.pga_value).toBe(38);
    expect(womens.get('scrambling_pct_sand')!.is_womens).toBe(true);
    expect(womens.get('big_number_rate')!.pga_omitted).toBe(true);
    expect(womens.get('big_number_rate')!.is_womens).toBe(true);

    const mens = applyGenderAnchorToMap(map, 'mens');
    expect(mens).toBe(map); // identity for men — no allocation, no change
    expect(mens.get('scrambling_pct_sand')!.pga_value).toBe(50);
    expect(mens.get('scrambling_pct_sand')!.is_womens).toBeUndefined();
  });
});
