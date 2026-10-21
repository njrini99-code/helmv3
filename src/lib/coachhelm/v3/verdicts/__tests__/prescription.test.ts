import { describe, expect, it } from 'vitest';
import { verdictMetricFor } from '../metrics';
import { countCacheByRound, countPuttsByRound } from '../post-counts';
import { buildPrescriptionFromRead, toColumnPatch } from '../prescription';

/** A synthetic putt-distance read, shaped like a v3 row's evidence. */
function puttRead(overrides: Record<string, unknown> = {}) {
  return {
    metric: 'putts_made_3_5ft_pct',
    unit: 'percent',
    your_value: 58,
    sample_n: 31,
    standing: { team_avg: 72, team_n: 9 },
    ...overrides,
  };
}

describe('buildPrescriptionFromRead', () => {
  it('stamps the full prescription from a read with a team prior', () => {
    const patch = buildPrescriptionFromRead({ evidence: puttRead(), targetMetric: 'putts_made_3_5ft_pct', assignedBy: 'coach' });
    expect(patch.criterionReason).toBeNull();
    if (patch.criterionReason !== null) throw new Error('expected a criterion');
    expect(patch.assigned_by).toBe('coach');
    expect(patch.baseline_n).toBe(31);
    // κ = 30 attempts for make rates: (31·0.58 + 30·0.72)/61
    expect(patch.baseline_shrunk).toBeCloseTo((31 * 0.58 + 30 * 0.72) / 61, 4);
    expect(patch.criterion.direction).toBe('higher');
    expect(patch.horizon.attempts).toBeGreaterThanOrEqual(20);
    expect(patch.horizon.attempts).toBeLessThanOrEqual(40);
    expect(patch.check_after_rounds).toBe(3);

    const columns = toColumnPatch(patch);
    expect(Object.keys(columns).sort()).toEqual(
      ['assigned_by', 'baseline_n', 'baseline_shrunk', 'check_after_rounds', 'criterion', 'horizon'].sort(),
    );
  });

  it('a coach target (percent) becomes the threshold when it is on the improving side', () => {
    const patch = buildPrescriptionFromRead({ evidence: puttRead(), targetMetric: 'putts_made_3_5ft_pct', coachTargetValue: 75, assignedBy: 'player' });
    if (patch.criterionReason !== null) throw new Error('expected a criterion');
    expect(patch.criterion.threshold).toBe(0.75);
    expect(patch.criterion.basis.threshold_source).toBe('coach');
    expect(patch.assigned_by).toBe('player');
  });

  it.each([
    ['no_evidence', { evidence: null, targetMetric: 'putts_made_3_5ft_pct' }],
    ['metric_mismatch', { evidence: puttRead(), targetMetric: 'putts_made_5_10ft_pct' }],
    ['metric_mismatch', { evidence: puttRead(), targetMetric: null }],
    ['no_verdict_metric', { evidence: puttRead({ metric: 'approach_proximity_50_125ft' }), targetMetric: 'approach_proximity_50_125ft' }],
    ['not_a_percent', { evidence: puttRead({ unit: 'feet' }), targetMetric: 'putts_made_3_5ft_pct' }],
    ['polarity_mismatch', { evidence: puttRead({ polarity: 'lower_better' }), targetMetric: 'putts_made_3_5ft_pct' }],
    ['no_baseline', { evidence: puttRead({ sample_n: 0 }), targetMetric: 'putts_made_3_5ft_pct' }],
    ['no_team_prior', { evidence: puttRead({ standing: { team_avg: 72, team_n: 3 } }), targetMetric: 'putts_made_3_5ft_pct' }],
    ['no_team_prior', { evidence: puttRead({ standing: undefined }), targetMetric: 'putts_made_3_5ft_pct' }],
  ])('no criterion (%s) still records who assigned it', (reason, input) => {
    const patch = buildPrescriptionFromRead({ ...input, assignedBy: 'coach' });
    expect(patch.criterionReason).toBe(reason);
    expect(toColumnPatch(patch)).toEqual({ assigned_by: 'coach', check_after_rounds: 3 });
  });
});

describe('post-window counts', () => {
  it('bands putts like update_player_putt_make_pct: (lo, hi], clamped feet, made = hole or putt_made', () => {
    const band = verdictMetricFor('putts_made_3_5ft_pct')!.source;
    if (band.kind !== 'putt_band') throw new Error('expected a putt band');
    const counts = countPuttsByRound(
      [
        { round_id: 'a', distance_to_hole_before: 3, result: 'hole', putt_made: null }, // 3 ft is outside (3, 5]
        { round_id: 'a', distance_to_hole_before: 3.5, result: 'hole', putt_made: null },
        { round_id: 'a', distance_to_hole_before: 5, result: 'green', putt_made: true },
        { round_id: 'a', distance_to_hole_before: 5.1, result: 'hole', putt_made: true }, // above the band
        { round_id: 'b', distance_to_hole_before: 4, result: 'green', putt_made: false },
        { round_id: 'b', distance_to_hole_before: null, result: 'hole', putt_made: true },
      ],
      band,
    );
    expect(counts.get('a')).toEqual({ made: 2, attempts: 2 });
    expect(counts.get('b')).toEqual({ made: 0, attempts: 1 });

    const longBand = verdictMetricFor('putts_made_25_plus_ft_pct')!.source;
    if (longBand.kind !== 'putt_band') throw new Error('expected a putt band');
    expect(countPuttsByRound([{ round_id: 'c', distance_to_hole_before: 400, result: 'hole', putt_made: null }], longBand).get('c')).toEqual({ made: 1, attempts: 1 });
  });

  it('pools stats-cache numerator and denominator per round, skipping rows without attempts', () => {
    const source = verdictMetricFor('scrambling_pct_sand')!.source;
    if (source.kind !== 'round_cache') throw new Error('expected a cache source');
    const counts = countCacheByRound(
      [
        { round_id: 'a', sand_saves: 1, sand_attempts: 3 },
        { round_id: 'b', sand_saves: 0, sand_attempts: 0 },
        { round_id: 'c', sand_saves: null, sand_attempts: 2 },
        { round_id: 'd', sand_saves: 5, sand_attempts: 2 },
      ],
      source,
    );
    expect(counts.get('a')).toEqual({ made: 1, attempts: 3 });
    expect(counts.has('b')).toBe(false);
    expect(counts.has('c')).toBe(false);
    expect(counts.get('d')).toEqual({ made: 2, attempts: 2 });
  });
});
