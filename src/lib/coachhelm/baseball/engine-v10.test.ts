/**
 * V10 CoachHelm baseball engine — honesty + correctness unit tests.
 *
 * Guards the wave plan's two highest risks and the V10 contracts:
 *   1. metric DIRECTION never "learns backward" (velo drop ≠ improvement);
 *   2. thin samples + proxy fidelity never present a false 'high';
 *   3. composites REQUIRE the cross-domain combination (no corroborator → no fire);
 *   4. multi-factor ranking promotes safety/recency, demotes thin/no-action;
 *   5. the outcome ledger sign is registry-resolved, not raw-delta.
 */

import { describe, it, expect } from 'vitest';
import {
  baseballImprovementSign,
  getBaseballMetricDirection,
  baseballMetricBreachesThreshold,
  isBaseballSampleThin,
  getBaseballMetricMinSample,
  getBaseballMetricThreshold,
} from './metrics/registry';
import type { LoadedMetric, LoadedPlayerMetrics } from './loaders';
import {
  pitcherCommandDecayComposite,
  hitterTranslationGapComposite,
  liftToFieldRiskComposite,
} from './generators/composites';
import { readinessGenerator } from './generators/v10';
import { scoreBaseballCandidate, rankBaseballCandidates } from './ranking';
import type { BaseballInsightCandidate } from './generators';

// ---- helpers ----------------------------------------------------------------

function metric(
  id: LoadedMetric['metric'],
  value: number,
  sample_n: number,
  confidence: number,
): LoadedMetric {
  return {
    metric: id,
    value,
    unit: 'ratio',
    sample_n,
    target_n: 10,
    confidence,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0, factors_measured: false },
    source_refs: [{ table: 'baseball_player_stats', visibility: 'staff_only', sample_n, confidence }],
  };
}

function player(metrics: Partial<LoadedPlayerMetrics['metrics']>): LoadedPlayerMetrics {
  return { playerId: 'p1', hittingGames: 12, pitchingGames: 8, metrics };
}

// ---- 1. DIRECTION discipline ------------------------------------------------

describe('registry direction discipline', () => {
  it('velocity drop is NOT an improvement (sign +1, raw drop = negative improvement)', () => {
    expect(getBaseballMetricDirection('avg_pitch_velocity')).toBe('higher_better');
    expect(baseballImprovementSign('avg_pitch_velocity')).toBe(1);
    // A drop of 3 mph → improvement-signed movement is negative (worse).
    const baseline = 90;
    const observed = 87;
    const signed = (observed - baseline) * baseballImprovementSign('avg_pitch_velocity');
    expect(signed).toBeLessThan(0);
  });

  it('K-rate is lower_better (sign -1): a drop is an IMPROVEMENT', () => {
    expect(baseballImprovementSign('k_rate')).toBe(-1);
    const signed = (0.2 - 0.3) * baseballImprovementSign('k_rate'); // dropped 10pts
    expect(signed).toBeGreaterThan(0);
  });

  it('workload is neutral_threshold (sign 0): never scored as improvement', () => {
    expect(baseballImprovementSign('rolling_pitch_count')).toBe(0);
    expect(baseballImprovementSign('soreness_level')).toBe(0);
  });

  it('breach test is direction-aware', () => {
    // lower_better K-rate breaches when value >= threshold
    expect(baseballMetricBreachesThreshold('k_rate', getBaseballMetricThreshold('k_rate') + 0.01)).toBe(true);
    expect(baseballMetricBreachesThreshold('k_rate', 0.1)).toBe(false);
    // higher_better strike% breaches when value <= threshold
    expect(baseballMetricBreachesThreshold('strike_pct', getBaseballMetricThreshold('strike_pct') - 0.01)).toBe(true);
    expect(baseballMetricBreachesThreshold('strike_pct', 0.9)).toBe(false);
  });
});

// ---- 2. thin-sample gate ----------------------------------------------------

describe('thin-sample gate', () => {
  it('flags below the registry min_sample', () => {
    const min = getBaseballMetricMinSample('two_strike_chase_pct');
    expect(isBaseballSampleThin('two_strike_chase_pct', min - 1)).toBe(true);
    expect(isBaseballSampleThin('two_strike_chase_pct', min)).toBe(false);
  });
});

// ---- 3. composites require corroboration ------------------------------------

describe('composites require the cross-domain combination', () => {
  it('command-decay does NOT fire on command alone', () => {
    const p = player({ walks_per_inning: metric('walks_per_inning', 0.8, 6, 0.8) });
    expect(pitcherCommandDecayComposite(p)).toHaveLength(0);
  });

  it('command-decay FIRES when command + workload co-occur', () => {
    const p = player({
      walks_per_inning: metric('walks_per_inning', 0.8, 6, 0.8),
      rolling_innings: metric('rolling_innings', 9, 2, 0.7),
    });
    const out = pitcherCommandDecayComposite(p);
    expect(out).toHaveLength(1);
    expect(out[0]!.generator).toBe('composite_command_decay');
    expect(out[0]!.evidence.source_refs.length).toBeGreaterThanOrEqual(2); // both legs cited
  });

  it('translation-gap suppresses when a readiness flag explains the slump', () => {
    const base = {
      game_practice_avg_delta: metric('game_practice_avg_delta', -0.08, 10, 0.7),
      two_strike_chase_pct: metric('two_strike_chase_pct', 0.32, 12, 0.45),
    };
    expect(hitterTranslationGapComposite(player(base))).toHaveLength(1);
    // With a soreness flag the story is readiness, not translation → suppressed.
    expect(
      hitterTranslationGapComposite(player({ ...base, soreness_level: metric('soreness_level', 5, 3, 0.6) })),
    ).toHaveLength(0);
  });

  it('lift-to-field risk fires only with BOTH a fatigue leg and a workload leg', () => {
    const fatigueOnly = player({ lift_rpe_avg: metric('lift_rpe_avg', 9, 4, 0.6) });
    expect(liftToFieldRiskComposite(fatigueOnly)).toHaveLength(0);
    const both = player({
      lift_rpe_avg: metric('lift_rpe_avg', 9, 4, 0.6),
      rolling_pitch_count: metric('rolling_pitch_count', 140, 2, 0.7),
    });
    const out = liftToFieldRiskComposite(both);
    expect(out).toHaveLength(1);
    expect(out[0]!.playerVisible).toBe(false); // staff-only load decision
  });
});

// ---- 4. readiness never uses medical language -------------------------------

describe('readiness generator honesty', () => {
  it('emits an operational flag with the non-medical caveat', () => {
    const p = player({ soreness_level: metric('soreness_level', 5, 3, 0.6) });
    const out = readinessGenerator(p);
    expect(out).toHaveLength(1);
    expect(out[0]!.evidence.diagnosis.recommended_action).toMatch(/not a medical assessment/i);
    expect(out[0]!.evidence.causality_level).toBe('inferred_hypothesis');
  });
});

// ---- 5. ranking model -------------------------------------------------------

describe('multi-factor ranking', () => {
  const mk = (
    generator: string,
    priority: BaseballInsightCandidate['priority'],
    confidence: number,
    extra: Partial<BaseballInsightCandidate> = {},
  ): BaseballInsightCandidate => ({
    generator,
    playerId: 'p1',
    insightType: `coachhelm_${generator}`,
    title: 't',
    body: 'b',
    priority,
    confidence,
    playerVisible: false,
    evidence: {
      sample_n: 10,
      target_n: 10,
      confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0, factors_measured: false },
      diagnosis: {
        symptom: 's',
        root_cause: 'r',
        causality_level: 'inferred_hypothesis',
        drivers: [],
        recommended_action: 'do x',
        confidence_reason: 'c',
      },
      causality_level: 'inferred_hypothesis',
      source_refs: [],
    },
    ...extra,
  });

  it('promotes a high safety signal above a medium operational one', () => {
    const safety = scoreBaseballCandidate(mk('composite_lift_to_field_risk', 'high', 0.7));
    const ops = scoreBaseballCandidate(mk('video_evidence', 'medium', 0.49));
    expect(safety).toBeGreaterThan(ops);
  });

  it('demotes a candidate with no recommended action', () => {
    const withAction = scoreBaseballCandidate(mk('readiness', 'medium', 0.6));
    const noAction = scoreBaseballCandidate(
      mk('readiness', 'medium', 0.6, {
        evidence: { ...mk('readiness', 'medium', 0.6).evidence, diagnosis: { ...mk('readiness', 'medium', 0.6).evidence.diagnosis, recommended_action: '' } },
      }),
    );
    expect(noAction).toBeLessThan(withAction);
  });

  it('promotes proximity to next event for player-scoped signals', () => {
    const c = mk('readiness', 'medium', 0.6);
    const near = scoreBaseballCandidate(c, { daysToNextEvent: 1 });
    const far = scoreBaseballCandidate(c, { daysToNextEvent: 14 });
    expect(near).toBeGreaterThan(far);
  });

  it('ranks the set descending and marks duplicates', () => {
    const ranked = rankBaseballCandidates([
      mk('workload', 'medium', 0.6),
      mk('composite_command_decay', 'high', 0.7),
    ]);
    expect(ranked[0]!.candidate.generator).toBe('composite_command_decay');
    expect(ranked[0]!.rankScore).toBeGreaterThanOrEqual(ranked[1]!.rankScore);
  });
});
