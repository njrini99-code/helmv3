/**
 * Tests for `metrics/distance-profile.ts` (addendum §13, A2 — pure metrics
 * only). Every scenario's expected numbers are stated by hand in
 * `fixtures/distance-profile-fixtures.ts` and asserted directly here.
 */
import { describe, expect, it } from 'vitest';
import { bucketApproachDistance } from '@/lib/coachhelm/v3/engine/shot-source';
import {
  computeDistanceProfile,
  type DistanceBand,
  type MetricResult,
} from '@/lib/coachhelm/v3/metrics/distance-profile';
import {
  approachFact,
  scope,
  SCENARIO_A_125_175,
  SCENARIO_B_UNDER_ATTEMPTS_50_125,
  SCENARIO_C_HOLES,
  SCENARIO_C_UNDER_ROUNDS_175_PLUS,
  SCENARIO_D_HOLES,
  SCENARIO_D_HOLES_PARTIAL,
  SCENARIO_D_LAYUP_175_PLUS,
  SCENARIO_E_BOUNDARIES,
  SCENARIO_E_HOLES,
} from './fixtures/distance-profile-fixtures';

const ALL_BANDS: readonly DistanceBand[] = ['50_125ft', '125_175ft', '175_plus_ft'];

function find(results: MetricResult[], id: MetricResult['id'], band: MetricResult['band']): MetricResult {
  const r = results.find((x) => x.id === id && x.band === band);
  if (!r) throw new Error(`no MetricResult for ${id}/${band}`);
  return r;
}

describe('distance-profile — band boundaries (49.9/50/124.9/125/174.9/175 yd)', () => {
  it('bucketApproachDistance itself draws the line exactly here (ground truth for bandOf)', () => {
    expect(bucketApproachDistance(49.9, 'yards')).toBeNull();
    expect(bucketApproachDistance(50.0, 'yards')).toBe('50_125ft');
    expect(bucketApproachDistance(124.9, 'yards')).toBe('50_125ft');
    expect(bucketApproachDistance(125.0, 'yards')).toBe('125_175ft');
    expect(bucketApproachDistance(174.9, 'yards')).toBe('125_175ft');
    expect(bucketApproachDistance(175.0, 'yards')).toBe('175_plus_ft');
  });

  it('computeDistanceProfile buckets each boundary fixture into the same band, end to end', () => {
    const facts = Object.values(SCENARIO_E_BOUNDARIES);
    const results = computeDistanceProfile(facts, scope('player-e'), SCENARIO_E_HOLES);

    // 49.9 yd belongs to no band — it must not inflate ANY band's attempts.
    const totalAttempts = ALL_BANDS
      .map((band) => find(results, 'approach_measured_contribution', band).value ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(totalAttempts).toBe(5); // 5 of the 6 fixtures land in a band

    expect(find(results, 'approach_measured_contribution', '50_125ft').value).toBe(2); // 50.0, 124.9
    expect(find(results, 'approach_measured_contribution', '125_175ft').value).toBe(2); // 125.0, 174.9
    expect(find(results, 'approach_measured_contribution', '175_plus_ft').value).toBe(1); // 175.0
  });
});

describe('distance-profile — known-answer denominators (scenario A, 125-175 yd, exactly at the support floor)', () => {
  // Band is 125-175, not 175+, so holes are irrelevant here — [] proves it.
  const results = computeDistanceProfile(SCENARIO_A_125_175, scope('player-a'), []);

  it('green_hit_rate = 6/10 attempts', () => {
    const r = find(results, 'approach_green_hit_rate', '125_175ft');
    expect(r.attempts).toBe(10);
    expect(r.distinctRounds).toBe(3);
    expect(r.support).toBe('supported');
    expect(r.value).toBe(60.0);
  });

  it('on_green_proximity_feet = avg(10,12,14,16,18,20) = 15.0', () => {
    const r = find(results, 'approach_on_green_proximity_feet', '125_175ft');
    expect(r.support).toBe('supported');
    expect(r.value).toBe(15.0);
  });

  it('direction_coverage = 2/4 missed shots carry a miss_direction', () => {
    const r = find(results, 'approach_direction_coverage', '125_175ft');
    expect(r.value).toBe(50.0);
  });

  it('severe_outcome_rate = 2/10 (one penalty, one sand — the other two misses are plain fairway/rough)', () => {
    const r = find(results, 'approach_severe_outcome_rate', '125_175ft');
    expect(r.value).toBe(20.0);
  });

  it('measured_contribution = 10, unconditionally', () => {
    const r = find(results, 'approach_measured_contribution', '125_175ft');
    expect(r.value).toBe(10);
    expect(r.support).toBe('supported');
  });
});

describe('distance-profile — support policy (sample size, distinct rounds, coverage)', () => {
  it('under MIN_ATTEMPTS: every rate metric is null, but measured_contribution still reports the true count', () => {
    const results = computeDistanceProfile(SCENARIO_B_UNDER_ATTEMPTS_50_125, scope('player-b'), []);
    expect(find(results, 'approach_green_hit_rate', '50_125ft')).toMatchObject({ support: 'under_supported', value: null });
    expect(find(results, 'approach_on_green_proximity_feet', '50_125ft')).toMatchObject({ support: 'under_supported', value: null });
    expect(find(results, 'approach_direction_coverage', '50_125ft')).toMatchObject({ support: 'under_supported', value: null });
    expect(find(results, 'approach_severe_outcome_rate', '50_125ft')).toMatchObject({ support: 'under_supported', value: null });
    const contribution = find(results, 'approach_measured_contribution', '50_125ft');
    expect(contribution.value).toBe(8); // never null, even under-supported
    expect(contribution.support).toBe('under_supported');
  });

  it('MIN_ATTEMPTS clears but MIN_ROUNDS fails (12 attempts, 2 rounds): still under-supported', () => {
    const results = computeDistanceProfile(SCENARIO_C_UNDER_ROUNDS_175_PLUS, scope('player-c'), SCENARIO_C_HOLES);
    const r = find(results, 'approach_green_hit_rate', '175_plus_ft');
    expect(r.attempts).toBe(12);
    expect(r.distinctRounds).toBe(2);
    expect(r.support).toBe('under_supported');
    expect(r.value).toBeNull();
    expect(r.layupExcludedN).toBe(0);
    expect(r.missingParExcludedN).toBe(0);
  });

  it('a band with zero shots reports measured_contribution 0, not an absent result', () => {
    const results = computeDistanceProfile([], scope('player-empty'), []);
    for (const band of ALL_BANDS) {
      expect(find(results, 'approach_measured_contribution', band).value).toBe(0);
      expect(find(results, 'approach_green_hit_rate', band).value).toBeNull();
    }
  });
});

describe('distance-profile — 175+ yd lay-up / missing-par exclusion (reuses Package 7B / addendum A2 semantics)', () => {
  it('with holes resolvable for all three: the confirmed par-5 missed-green shot is excluded as a likely lay-up', () => {
    const results = computeDistanceProfile(SCENARIO_D_LAYUP_175_PLUS, scope('player-d'), SCENARIO_D_HOLES);
    const r = find(results, 'approach_measured_contribution', '175_plus_ft');
    expect(r.attempts).toBe(2); // d2 (par-4 miss) and d3 (par-5 green-finder) remain
    expect(r.layupExcludedN).toBe(1); // d1 only
    expect(r.missingParExcludedN).toBe(0);
  });

  it('a par-5 approach that FOUND the green is never tagged a lay-up, even when resolvable', () => {
    const results = computeDistanceProfile(SCENARIO_D_LAYUP_175_PLUS, scope('player-d'), SCENARIO_D_HOLES);
    const r = find(results, 'approach_green_hit_rate', '175_plus_ft');
    // Only 2 eligible attempts (d2, d3) — well under MIN_ATTEMPTS=10, so the
    // rate itself is null regardless; d3's inclusion (not excluded as a
    // lay-up despite being a par-5) is what the attempts/layupExcludedN
    // counts above already prove.
    expect(r.attempts).toBe(2);
    expect(r.support).toBe('under_supported');
    expect(r.value).toBeNull();
  });

  it('with no holes at all: every 175+ shot is excluded as missing_par, never silently kept', () => {
    const results = computeDistanceProfile(SCENARIO_D_LAYUP_175_PLUS, scope('player-d'), []);
    const r = find(results, 'approach_measured_contribution', '175_plus_ft');
    expect(r.attempts).toBe(0); // nothing kept — an unresolvable par is excluded, not assumed safe
    expect(r.layupExcludedN).toBe(0);
    expect(r.missingParExcludedN).toBe(3);
  });

  it('resolves par PER SHOT: only d1 is resolvable, so d1 is a layup exclusion and d2/d3 are missing_par', () => {
    const results = computeDistanceProfile(SCENARIO_D_LAYUP_175_PLUS, scope('player-d'), SCENARIO_D_HOLES_PARTIAL);
    const r = find(results, 'approach_measured_contribution', '175_plus_ft');
    expect(r.attempts).toBe(0);
    expect(r.layupExcludedN).toBe(1); // d1
    expect(r.missingParExcludedN).toBe(2); // d2, d3
  });
});

describe('distance-profile — scope', () => {
  it('only ever profiles approach shots, ignoring a putt or tee shot at the same distance', () => {
    const facts = [
      approachFact({ round_id: 'r1', shot_type: 'putting', distance_to_hole_before_feet: 300 }),
      approachFact({ round_id: 'r1', shot_type: 'tee', distance_to_hole_before_feet: 300 }),
    ];
    const results = computeDistanceProfile(facts, scope('player-x'), []);
    expect(find(results, 'approach_measured_contribution', '50_125ft').value).toBe(0);
  });

  it('echoes scope.player_id onto every MetricResult', () => {
    const results = computeDistanceProfile(SCENARIO_A_125_175, scope('player-echo'), []);
    expect(results.every((r) => r.playerId === 'player-echo')).toBe(true);
  });
});

describe('distance-profile — recorded travel distance vs. derived progress', () => {
  it('every MetricResult states distanceMethod: recorded — this module never derives a distance from hole yardage', () => {
    const results = computeDistanceProfile(SCENARIO_A_125_175, scope('player-a'), []);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.distanceMethod === 'recorded')).toBe(true);
  });
});
