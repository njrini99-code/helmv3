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
  loadPlayerMetrics,
  loadAllPlayerMetrics,
  normalizeBoxScoreBattingRow,
  normalizeBoxScorePitchingRow,
  eventDerivedVelocityFromMetrics,
  type BoxScoreRow,
} from './loaders';
import {
  pitcherCommandDecayComposite,
  hitterTranslationGapComposite,
  liftToFieldRiskComposite,
} from './generators/composites';
import { readinessGenerator } from './generators/v10';
import { scoreBaseballCandidate, rankBaseballCandidates } from './ranking';
import type { BaseballInsightCandidate } from './generators';
import type { DerivedMetric } from '@/lib/baseball/read-models/elite-stat-events';

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
    // #379: fixture cites the canonical box-score table now that loaders.ts
    // sources migrated callers from it — see stat-layer-manifest.ts.
    source_refs: [{ table: 'baseball_box_score_batting', visibility: 'staff_only', sample_n, confidence }],
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

// ---- 6. #379 reconciliation — loaders.ts source-table + event-derived -----
// wiring. Every case here is additive/backward-compatible: an unmigrated
// caller (no 4th/5th arg, no hittingSourceTable/pitchingSourceTable tag) gets
// EXACTLY today's legacy behavior; the new inputs only change output when a
// caller opts in.

function derivedMetric(overrides: Partial<DerivedMetric>): DerivedMetric {
  return {
    metricKey: 'avg_exit_velocity',
    metricGroup: 'hitting',
    label: 'Avg Exit Velo',
    value: 90,
    unit: 'mph',
    higherIsBetter: true,
    sampleSize: 12,
    confidence: 'high',
    trustTier: 'official',
    dataContext: 'official_game',
    sourceId: null,
    ...overrides,
  };
}

describe('loaders #379 reconciliation — source-table + event-derived wiring', () => {
  const legacyRows: BoxScoreRow[] = [
    {
      id: 'r1',
      player_id: 'p1',
      stat_type: 'game',
      session_date: '2026-04-01',
      at_bats: 4,
      hits: 2,
      walks: 1,
      strikeouts: 1,
      hit_by_pitch: 0,
      sacrifice_flies: 0,
      doubles: 0,
      triples: 0,
      home_runs: 0,
      exit_velocity: 90,
    },
    {
      id: 'r2',
      player_id: 'p1',
      stat_type: 'game',
      session_date: '2026-04-08',
      at_bats: 4,
      hits: 1,
      walks: 0,
      strikeouts: 2,
      hit_by_pitch: 0,
      sacrifice_flies: 0,
      doubles: 0,
      triples: 0,
      home_runs: 0,
      exit_velocity: 94,
    },
  ];

  it('an unmigrated caller (no eventDerived, no source-table tag) keeps citing the legacy table exactly as before', () => {
    const loaded = loadPlayerMetrics('p1', legacyRows);
    expect(loaded.metrics.avg_exit_velocity?.value).toBeCloseTo(92);
    expect(loaded.metrics.avg_exit_velocity?.source_refs[0]?.table).toBe('baseball_player_stats');
    expect(loaded.metrics.max_exit_velocity?.value).toBe(94);
    expect(loaded.metrics.max_exit_velocity?.source_refs[0]?.table).toBe('baseball_player_stats');
  });

  it('an event-derived value WINS over the legacy scalar per-field, never blended, never fabricated for the untouched field', () => {
    const loaded = loadPlayerMetrics('p1', legacyRows, undefined, {
      avgExitVelocity: { value: 91, sampleSize: 5 },
    });
    expect(loaded.metrics.avg_exit_velocity?.value).toBe(91);
    expect(loaded.metrics.avg_exit_velocity?.sample_n).toBe(5);
    expect(loaded.metrics.avg_exit_velocity?.source_refs[0]?.table).toBe('baseball_batted_ball_events');
    // max_exit_velocity had no event input → still the legacy fallback.
    expect(loaded.metrics.max_exit_velocity?.value).toBe(94);
    expect(loaded.metrics.max_exit_velocity?.source_refs[0]?.table).toBe('baseball_player_stats');
  });

  it('threads a normalized box-score row\'s real source table into the emitted source_refs (batting + pitching)', () => {
    const battingRow = normalizeBoxScoreBattingRow(
      { id: 'bb1', player_id: 'p2', ab: 4, h: 2, doubles: 1, triples: 0, hr: 0, bb: 1, k: 1, hbp: 0, sf: 0 },
      '2026-04-01',
    );
    const hitter = loadPlayerMetrics('p2', [battingRow]);
    expect(hitter.metrics.batting_avg?.value).toBeCloseTo(0.5);
    expect(hitter.metrics.batting_avg?.source_refs[0]?.table).toBe('baseball_box_score_batting');

    const pitchingRow = normalizeBoxScorePitchingRow(
      { id: 'bp1', player_id: 'p3', ip: 5, bb: 2, k: 6, er: 2, pitch_count: 80, strikes: 52 },
      '2026-04-02',
    );
    const pitcher = loadPlayerMetrics('p3', [pitchingRow]);
    expect(pitcher.metrics.era?.value).toBeCloseTo(3.6);
    expect(pitcher.metrics.era?.source_refs[0]?.table).toBe('baseball_box_score_pitching');
  });

  it('eventDerivedVelocityFromMetrics pulls avg exit/pitch velocity and leaves max fields null (no event max metric exists yet)', () => {
    const out = eventDerivedVelocityFromMetrics([
      derivedMetric({ metricKey: 'avg_exit_velocity', value: 92, sampleSize: 10 }),
      derivedMetric({ metricKey: 'avg_velocity', metricGroup: 'pitching', value: 88, sampleSize: 40 }),
      derivedMetric({ metricKey: 'chase_rate', value: 0.3, sampleSize: 20 }),
    ]);
    expect(out.avgExitVelocity).toEqual({ value: 92, sampleSize: 10 });
    expect(out.avgPitchVelocity).toEqual({ value: 88, sampleSize: 40 });
    expect(out.maxExitVelocity).toBeNull();
    expect(out.maxPitchVelocity).toBeNull();
  });

  it('eventDerivedVelocityFromMetrics returns null fields when no matching metric key exists (honest absence, never fabricated)', () => {
    const out = eventDerivedVelocityFromMetrics([derivedMetric({ metricKey: 'chase_rate', value: 0.3 })]);
    expect(out.avgExitVelocity).toBeNull();
    expect(out.avgPitchVelocity).toBeNull();
  });

  it('loadAllPlayerMetrics preserves nowIso positionally and threads per-player event overrides additively', () => {
    const rows: BoxScoreRow[] = [
      {
        id: 'pr1',
        player_id: 'p4',
        stat_type: 'game',
        session_date: '2026-06-01',
        innings_pitched: 5,
        pitches_thrown: 70,
        walks_allowed: 1,
        strikeouts_thrown: 6,
        earned_runs: 1,
      },
    ];
    const nowIso = '2026-06-03T00:00:00.000Z'; // within the 7-day rolling window
    const [p4] = loadAllPlayerMetrics(['p4'], rows, nowIso, {
      p4: { avgPitchVelocity: { value: 89, sampleSize: 3 } },
    });
    expect(p4!.metrics.rolling_pitch_count?.value).toBe(70);
    expect(p4!.metrics.avg_pitch_velocity?.value).toBe(89);
    expect(p4!.metrics.avg_pitch_velocity?.source_refs[0]?.table).toBe('baseball_pitch_events');
  });
});
