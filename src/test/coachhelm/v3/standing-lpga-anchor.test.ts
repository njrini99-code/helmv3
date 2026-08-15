import { describe, it, expect } from 'vitest';

import {
  applyGenderAnchor,
  type LpgaStandards,
} from '@/lib/coachhelm/v3/standing/gender-anchor';
import type { PgaStandard } from '@/lib/coachhelm/v3/standing/pga-standards';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

/**
 * The LPGA wire-up (owner decision 2026-08-15: PGA for men, LPGA for women).
 *
 * Companion to standing-gender-anchor.test.ts, which is deliberately left
 * alone: every assertion in that file calls applyGenderAnchor with TWO
 * arguments, and now pins the FALLBACK path — what still happens when no LPGA
 * map is supplied. Both files are load-bearing; neither was softened to make
 * the other pass.
 *
 * Values below are the real rows in golf_pga_standards, read 2026-08-15:
 *   scrambling_pct_sand           pga 50    lpga 45
 *   approach_proximity_50_125ft   pga 18    lpga 26     <- FEET, lower_better
 *   big_number_rate               pga 2.0   lpga 3.0
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
    pga_value: 50, // men's Tour value — what the DB pipeline writes for everyone
    pga_delta: -50,
    computed_at: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

function standard(metric: MetricId, value: number | null): PgaStandard {
  return {
    metric_id: metric,
    season: '2026',
    tour: 'lpga',
    display_label: metric,
    pga_tour_value: value,
    korn_ferry_value: null,
    div1_avg_value: null,
    div2_avg_value: null,
    div3_avg_value: null,
    hs_avg_value: null,
    pga_p25: null,
    pga_p50: null,
    pga_p75: null,
    source: 'test',
  } as PgaStandard;
}

function lpgaMap(entries: Array<[MetricId, number | null]>): LpgaStandards {
  return new Map(entries.map(([m, v]) => [m, standard(m, v)]));
}

describe('LPGA rows beat the estimate table', () => {
  it('anchors sand save to the real LPGA 45, not the hand-authored 38', () => {
    const lpga = lpgaMap([['scrambling_pct_sand', 45]]);
    const s = applyGenderAnchor(rawStanding({ player_value: 40 }), 'womens', lpga);

    expect(s.pga_value).toBe(45);
    // NOT the estimate, and NOT the men's 50.
    expect(s.pga_value).not.toBe(38);
    expect(s.pga_value).not.toBe(50);
    expect(s.pga_delta).toBe(-5); // 40 − 45
    expect(s.is_womens).toBe(true);
    expect(s.pga_omitted).toBe(false);
  });

  it('makes the anchor HARDER than the estimate — this is the intended trade', () => {
    const withLpga = applyGenderAnchor(
      rawStanding({ player_value: 40 }),
      'womens',
      lpgaMap([['scrambling_pct_sand', 45]]),
    );
    const withEstimate = applyGenderAnchor(rawStanding({ player_value: 40 }), 'womens');

    // 45 vs 38: a player unchanged at 40% moves from +2 over the estimate to
    // −5 against the tour. Pinned so nobody "fixes" the regression later —
    // measuring against the LPGA is the decision, not a bug.
    expect(withEstimate.pga_delta).toBeGreaterThan(0);
    expect(withLpga.pga_delta).toBeLessThan(0);
    expect(withLpga.pga_value!).toBeGreaterThan(withEstimate.pga_value!);
  });
});

describe('the approach-proximity unit bug', () => {
  // cohort-baselines.ts stores approach_proximity_* as a green-hit PERCENT
  // (mens 80 / womens 70). The registry types those metrics `lower_better` and
  // the DB stores PROXIMITY IN FEET (pga 18ft, lpga 26ft). Feeding "70" into a
  // feet-denominated, lower-is-better slot scored a woman at 25ft as 45ft
  // BETTER than tour, when she is actually 1ft off it.
  const metric = 'approach_proximity_50_125ft' as MetricId;

  it('uses LPGA feet (26), not the percent-shaped estimate (70)', () => {
    const s = applyGenderAnchor(
      rawStanding({ metric_id: metric, player_value: 25, pga_value: 18 }),
      'womens',
      lpgaMap([[metric, 26]]),
    );

    expect(s.pga_value).toBe(26);
    expect(s.pga_value).not.toBe(70);
  });

  it('stops reporting a player 1ft off tour as 45ft better than it', () => {
    const fixed = applyGenderAnchor(
      rawStanding({ metric_id: metric, player_value: 25, pga_value: 18 }),
      'womens',
      lpgaMap([[metric, 26]]),
    );
    const broken = applyGenderAnchor(
      rawStanding({ metric_id: metric, player_value: 25, pga_value: 18 }),
      'womens',
    );

    // lower_better: −1 means she is 1ft INSIDE the LPGA average. Credible.
    expect(fixed.pga_delta).toBe(-1);
    // The estimate path produces −45 on a metric measured in feet. Absurd, and
    // it is what production shows women today.
    expect(broken.pga_delta).toBe(-45);
  });
});

describe('the fallback chain is preserved, and never reaches the men\'s value', () => {
  it('falls back to the estimate when the metric has no LPGA row', () => {
    // Map deliberately lacks scrambling_pct_sand.
    const s = applyGenderAnchor(
      rawStanding({ player_value: 0 }),
      'womens',
      lpgaMap([['gir_pct' as MetricId, 70]]),
    );
    expect(s.pga_value).toBe(38); // the estimate, not the men's 50
  });

  it('falls back to the estimate when the LPGA row exists but its value is null', () => {
    const s = applyGenderAnchor(
      rawStanding({ player_value: 0 }),
      'womens',
      lpgaMap([['scrambling_pct_sand', null]]),
    );
    expect(s.pga_value).toBe(38);
  });

  it('OMITS rather than showing the men\'s value when neither source has one', () => {
    // big_number_rate has no women\'s estimate — the honesty rule that predates
    // this change. An empty LPGA map must not weaken it.
    const s = applyGenderAnchor(
      rawStanding({ metric_id: 'big_number_rate' as MetricId, pga_value: 2.0 }),
      'womens',
      lpgaMap([]),
    );
    expect(s.pga_omitted).toBe(true);
    expect(s.is_womens).toBe(true);
  });

  it('gives big_number_rate a real anchor once its LPGA row IS supplied', () => {
    // Coverage gain: 28 LPGA rows exist, so metrics that used to render NO
    // reference marker for women now get one.
    const s = applyGenderAnchor(
      rawStanding({ metric_id: 'big_number_rate' as MetricId, player_value: 3.5, pga_value: 2.0 }),
      'womens',
      lpgaMap([['big_number_rate' as MetricId, 3.0]]),
    );
    expect(s.pga_omitted).toBe(false);
    expect(s.pga_value).toBe(3.0);
    expect(s.pga_delta).toBeCloseTo(0.5, 10);
  });
});

describe('men are untouched', () => {
  it('ignores the LPGA map entirely for a men\'s cohort', () => {
    const raw = rawStanding({ player_value: 40, pga_value: 50, pga_delta: -10 });
    const s = applyGenderAnchor(raw, 'mens', lpgaMap([['scrambling_pct_sand', 45]]));

    // Identity, not merely equality — the men's path returns the same object.
    expect(s).toBe(raw);
    expect(s.pga_value).toBe(50);
    expect(s.is_womens).toBeUndefined();
  });
});
