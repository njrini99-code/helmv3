/**
 * V10 §"Role visibility is tested" (delta-doc line 280) + the metric-registry
 * contract "metric_key → … role visibility".
 *
 * Proves the registry's per-metric PLAYER-ELIGIBILITY FLOOR and the strictest-wins
 * resolver, end-to-end into a real generator:
 *
 *   1. every metric declares a role-visibility floor (player_eligible);
 *   2. staff-only scouting / health / operations metrics are NEVER player-eligible;
 *   3. the player's own performance metrics ARE player-eligible;
 *   4. baseballMetricPlayerVisible is strictest-wins (floor AND source) and NEVER
 *      widens visibility — a permissive source can't expose a staff-only metric;
 *   5. an unknown id defaults to the conservative staff-only floor;
 *   6. a real generator (workload, staff-only) stays coach-only even when fed a
 *      team-visible source ref, while a player-eligible hitting metric flows.
 */

import { describe, it, expect } from 'vitest';
import {
  BASEBALL_METRIC_IDS,
  BASEBALL_METRIC_META,
  getBaseballMetricPlayerEligible,
  baseballMetricPlayerVisible,
  type BaseballMetricId,
} from './registry';
import { workloadGenerator, twoStrikeChaseGenerator } from '../generators';
import type { LoadedMetric, LoadedPlayerMetrics } from '../loaders';
import type { BaseballInsightSourceRef } from '@/lib/types/baseball-coachhelm';

// Metrics that must NEVER reach a player raw: opponent-exploitability scouting,
// raw error / decision call-outs, health/operational coach-judgment surfaces.
const STAFF_ONLY: BaseballMetricId[] = [
  'pitcher_handedness_split',
  'pitcher_pitch_mix_predictability',
  'catcher_run_game_risk',
  'catcher_pop_time',
  'catcher_recent_innings_caught',
  'defense_error_cluster_rate',
  'defense_routine_reliability',
  'baserunning_out_rate',
  'baserunning_cs_decision_risk',
  'rolling_pitch_count',
  'rolling_innings',
  'soreness_level',
  'energy_level',
  'sleep_hours',
  'arm_status_level',
  'lift_rpe_avg',
  'practice_attendance_rate',
  'import_warning_rate',
  'class_conflict_count',
  'stale_source_days',
];

// Metrics that ARE the athlete's own development record → player-eligible.
const PLAYER_ELIGIBLE: BaseballMetricId[] = [
  'k_rate',
  'bb_rate',
  'batting_avg',
  'two_strike_chase_pct',
  'game_practice_avg_delta',
  'avg_exit_velocity',
  'pitcher_k_bb_ratio',
  'strike_pct',
  'avg_pitch_velocity',
  'pitcher_velo_inning_decay',
  'catcher_throw_accuracy',
  'defense_throw_accuracy',
  'baserunning_extra_base_rate',
  'lift_completion_rate',
];

function ref(visibility: BaseballInsightSourceRef['visibility']): BaseballInsightSourceRef {
  // #379: fixture cites the canonical box-score table now that loaders.ts
  // sources migrated callers from it — see stat-layer-manifest.ts.
  return { table: 'baseball_box_score_batting', visibility, sample_n: 30 };
}

function loadedMetric(metric: BaseballMetricId, value: number, vis: BaseballInsightSourceRef['visibility']): LoadedMetric {
  return {
    metric,
    value,
    unit: BASEBALL_METRIC_META[metric].unit,
    sample_n: 30,
    target_n: 30,
    confidence: 0.9,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
    source_refs: [ref(vis)],
  };
}

describe('registry role-visibility floor (V10 line 280)', () => {
  it('declares a role-visibility floor for EVERY metric (no silent omission)', () => {
    for (const id of BASEBALL_METRIC_IDS) {
      expect(typeof BASEBALL_METRIC_META[id].player_eligible).toBe('boolean');
    }
  });

  it('keeps staff-only scouting / health / ops metrics player-ineligible', () => {
    for (const id of STAFF_ONLY) {
      expect(getBaseballMetricPlayerEligible(id)).toBe(false);
    }
  });

  it("marks the athlete's own performance metrics player-eligible", () => {
    for (const id of PLAYER_ELIGIBLE) {
      expect(getBaseballMetricPlayerEligible(id)).toBe(true);
    }
  });

  it('is strictest-wins: floor AND source, never widening visibility', () => {
    // Player-eligible metric + permissive source → visible.
    expect(baseballMetricPlayerVisible('batting_avg', true)).toBe(true);
    // Player-eligible metric + staff-only source → NOT visible (source narrows).
    expect(baseballMetricPlayerVisible('batting_avg', false)).toBe(false);
    // Staff-only metric + permissive source → NOT visible (floor narrows, the
    // exact leak this fixes: a permissive ref can't expose scouting intel).
    expect(baseballMetricPlayerVisible('pitcher_handedness_split', true)).toBe(false);
    // Staff-only metric + staff-only source → NOT visible.
    expect(baseballMetricPlayerVisible('rolling_pitch_count', false)).toBe(false);
  });

  it('defaults an unknown metric id to the conservative staff-only floor', () => {
    expect(getBaseballMetricPlayerEligible('not_a_real_metric')).toBe(false);
    expect(baseballMetricPlayerVisible('not_a_real_metric', true)).toBe(false);
  });
});

describe('generator integration — floor enforced through real signals', () => {
  it('keeps a workload signal coach-only EVEN with a team-visible source ref', () => {
    // rolling_pitch_count is player_eligible:false. Hand it a TEAM-visible source
    // ref (which would pass the old source-only rule) and confirm the floor still
    // keeps the signal staff-only.
    const player: LoadedPlayerMetrics = {
      playerId: 'p1',
      hittingGames: 0,
      pitchingGames: 4,
      metrics: { rolling_pitch_count: loadedMetric('rolling_pitch_count', 160, 'team') },
    };
    const [signal] = workloadGenerator(player);
    expect(signal).toBeDefined();
    expect(signal!.playerVisible).toBe(false);
  });

  it('lets a player-eligible hitting signal flow when the source permits', () => {
    // two_strike_chase_pct is player_eligible:true. With a team-visible source the
    // floor passes and the player can own their own approach signal.
    const player: LoadedPlayerMetrics = {
      playerId: 'p2',
      hittingGames: 12,
      pitchingGames: 0,
      metrics: { two_strike_chase_pct: loadedMetric('two_strike_chase_pct', 0.42, 'team') },
    };
    const [signal] = twoStrikeChaseGenerator(player);
    expect(signal).toBeDefined();
    expect(signal!.playerVisible).toBe(true);
  });
});
