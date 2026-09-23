import { describe, expect, it } from 'vitest';
import { computeDistanceProfile } from '@/lib/coachhelm/v3/metrics/distance-profile';
import type { MetricResult } from '@/lib/coachhelm/v3/metrics/distance-profile';
import {
  scope,
  SCENARIO_A_125_175,
  SCENARIO_B_UNDER_ATTEMPTS_50_125,
} from '@/test/coachhelm/v3/fixtures/distance-profile-fixtures';
import { buildDistanceProfileViewModel } from '../buildDistanceProfileViewModel';

describe('buildDistanceProfileViewModel', () => {
  it('groups a fully-supported band into one section, 5 rows, canonical order', () => {
    const results = computeDistanceProfile(SCENARIO_A_125_175, scope('p1'), []);
    const sections = buildDistanceProfileViewModel(results);

    // computeDistanceProfile always emits 5 rows per band (the other two
    // bands get an all-'invalid' row set here, since no fixture shot falls
    // in them) — so all 3 bands appear; only the 125_175 section is
    // fully-supported.
    expect(sections).toHaveLength(3);
    const supported = sections.find((s) => s.band === '125_175ft');
    expect(supported).toBeDefined();
    expect(supported?.rows.map((r) => r.metricId)).toEqual([
      'approach_green_hit_rate',
      'approach_on_green_proximity_feet',
      'approach_direction_coverage',
      'approach_severe_outcome_rate',
      'approach_measured_contribution',
    ]);
    // Scenario A sits exactly at the support floor (10 attempts, 3 rounds) —
    // every row in the fixture's own header comment is a real, floor-clearing
    // number, so every row is 'supported'.
    expect(supported?.rows.every((r) => r.kind === 'supported')).toBe(true);
  });

  it('an under-floor band reports kind "insufficient" alongside a non-null value — proves a surface cannot switch on value alone', () => {
    const results = computeDistanceProfile(SCENARIO_B_UNDER_ATTEMPTS_50_125, scope('p1'), []);
    const sections = buildDistanceProfileViewModel(results);

    const underFloor = sections.find((s) => s.band === '50_125ft');
    expect(underFloor).toBeDefined();
    const contribution = underFloor?.rows.find((r) => r.metricId === 'approach_measured_contribution');
    expect(contribution).toBeDefined();
    // The trap this test exists to catch: an 8-attempt band is genuinely
    // under MIN_ATTEMPTS(10), so `status`/`kind` is 'insufficient' — but
    // `value` is still a real, non-null 8 (measured_contribution never nulls
    // its value). A surface gating on `value !== null` instead of `kind`
    // would wrongly treat this row as confident.
    expect(contribution?.kind).toBe('insufficient');
    expect(contribution?.row.value).toBe(8);
    expect(contribution?.row.value).not.toBeNull();

    // Same trap applies to the ordinary rate rows: attempts (8) is nonzero,
    // so their `value` is a real computed number too, even though the band
    // as a whole is under-supported.
    const greenHitRate = underFloor?.rows.find((r) => r.metricId === 'approach_green_hit_rate');
    expect(greenHitRate?.kind).toBe('insufficient');
    expect(greenHitRate?.row.value).not.toBeNull();
  });

  it('a band with zero facts still reports the always-present measured_contribution row as kind "invalid" with value 0, never null', () => {
    const results = computeDistanceProfile([], scope('p1'), []);
    const sections = buildDistanceProfileViewModel(results);

    // Every one of the three bands' rows has denominator 0 -> 'invalid'.
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      const contribution = section.rows.find((r) => r.metricId === 'approach_measured_contribution');
      expect(contribution?.kind).toBe('invalid');
      expect(contribution?.row.value).toBe(0);
    }
  });

  it('drops a row whose band or metricId is not recognized, rather than guessing it into a section', () => {
    const base = computeDistanceProfile(SCENARIO_A_125_175, scope('p1'), []).find(
      (r) => r.metricId === 'approach_green_hit_rate' && r.dimensions.band === '125_175ft',
    );
    expect(base).toBeDefined();
    if (!base) throw new Error('unreachable — asserted above');
    const bogusBand: MetricResult = { ...base, dimensions: { band: 'unknown_band' } };
    const bogusMetric: MetricResult = { ...base, metricId: 'not_a_real_metric' };

    const sections = buildDistanceProfileViewModel([bogusBand, bogusMetric]);
    expect(sections).toHaveLength(0);
  });

  it('groups are keyed on dimensions.band regardless of input array order', () => {
    const results = computeDistanceProfile(SCENARIO_A_125_175, scope('p1'), []);
    const shuffled = [...results].reverse();
    const sections = buildDistanceProfileViewModel(shuffled);
    const supported = sections.find((s) => s.band === '125_175ft');

    expect(supported?.rows.map((r) => r.metricId)).toEqual([
      'approach_green_hit_rate',
      'approach_on_green_proximity_feet',
      'approach_direction_coverage',
      'approach_severe_outcome_rate',
      'approach_measured_contribution',
    ]);
  });

  it('every row carries its own MetricResult verbatim for a drill-down to reuse without a refetch', () => {
    const results = computeDistanceProfile(SCENARIO_A_125_175, scope('p1'), []);
    const sections = buildDistanceProfileViewModel(results);
    for (const section of sections) {
      for (const row of section.rows) {
        const source = results.find(
          (r) => r.metricId === row.metricId && r.dimensions.band === section.band,
        );
        expect(row.row).toBe(source);
      }
    }
  });
});
