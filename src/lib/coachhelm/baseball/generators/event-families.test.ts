/**
 * Deepened V6/V10 generator catalog — honesty + correctness unit tests.
 *
 * Guards the SAME two wave risks the box-score five guard, applied to the new
 * catching/defense/baserunning + deepened hitting/pitching families:
 *   1. DIRECTION discipline — a generator fires on the registry-resolved concern
 *      side ONLY (a velo DROP / pop-time RISE is the concern; a good value never
 *      fires; nothing is scored "backward");
 *   2. thin-sample + confidence gates — a thin/low-confidence band never presents
 *      a false 'high';
 *   3. source-starved → silence — a player with no event data emits NO catching/
 *      defense/baserunning signals (honest absence, never a fabricated value);
 *   4. the class/operations family fires on deterministic counts as
 *      observed_sequence.
 */

import { describe, it, expect } from 'vitest';
import type { LoadedMetric, LoadedPlayerMetrics } from '../loaders';
import {
  getBaseballMetricThreshold,
  getBaseballMetricDirection,
  baseballImprovementSign,
} from '../metrics/registry';
import {
  runBaseballEventFamilyGenerators,
  pitcherVeloDecayGenerator,
  catcherPopTimeGenerator,
  hitterZoneContactGenerator,
  defenseErrorClusterGenerator,
  baserunningOutRateGenerator,
} from './event-families';
import {
  classConflictGenerator,
  missingAcknowledgementGenerator,
  staleSourceDataGenerator,
  tasksUnseenGenerator,
} from './class-ops';

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
    source_refs: [{ table: 'baseball_pitch_events', visibility: 'staff_only', sample_n, confidence }],
  };
}

function player(metrics: Partial<LoadedPlayerMetrics['metrics']>): LoadedPlayerMetrics {
  return { playerId: 'p1', hittingGames: 20, pitchingGames: 8, metrics };
}

// ---- DIRECTION: velo decay can never read as an improvement -----------------

describe('event-family direction discipline', () => {
  it('velo-decay metric is higher_better on the signed delta (a DROP is the concern, never an improvement)', () => {
    expect(getBaseballMetricDirection('pitcher_velo_inning_decay')).toBe('higher_better');
    expect(baseballImprovementSign('pitcher_velo_inning_decay')).toBe(1);
    // A −2.5 mph late-outing drop breaches the −1.5 threshold (value <= threshold
    // for higher_better) → fires. A +0.5 (no drop) does NOT.
    const fires = pitcherVeloDecayGenerator(
      player({ pitcher_velo_inning_decay: metric('pitcher_velo_inning_decay', -2.5, 30, 0.7) }),
    );
    expect(fires).toHaveLength(1);
    const noFire = pitcherVeloDecayGenerator(
      player({ pitcher_velo_inning_decay: metric('pitcher_velo_inning_decay', 0.5, 30, 0.7) }),
    );
    expect(noFire).toHaveLength(0);
  });

  it('pop time is lower_better — a SLOW pop fires, a fast one does not', () => {
    expect(getBaseballMetricDirection('catcher_pop_time')).toBe('lower_better');
    const slow = catcherPopTimeGenerator(
      player({ catcher_pop_time: metric('catcher_pop_time', getBaseballMetricThreshold('catcher_pop_time') + 0.2, 10, 0.49) }),
    );
    expect(slow).toHaveLength(1);
    const fast = catcherPopTimeGenerator(
      player({ catcher_pop_time: metric('catcher_pop_time', 1.85, 10, 0.49) }),
    );
    expect(fast).toHaveLength(0);
  });

  it('in-zone contact is higher_better — a LOW rate fires, a high one does not', () => {
    const low = hitterZoneContactGenerator(
      player({ hitter_zone_contact_rate: metric('hitter_zone_contact_rate', 0.7, 30, 1) }),
    );
    expect(low).toHaveLength(1);
    const high = hitterZoneContactGenerator(
      player({ hitter_zone_contact_rate: metric('hitter_zone_contact_rate', 0.92, 30, 1) }),
    );
    expect(high).toHaveLength(0);
  });
});

// ---- thin-sample / confidence gate ------------------------------------------

describe('event-family gates', () => {
  it('a thin sample can never present as high even past threshold', () => {
    // error rate well past threshold but sample below min_sample (10) → low.
    const out = defenseErrorClusterGenerator(
      player({ defense_error_cluster_rate: metric('defense_error_cluster_rate', 0.4, 3, 1) }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.priority).toBe('low');
  });

  it('adequate sample + far past threshold can reach high', () => {
    const out = baserunningOutRateGenerator(
      player({ baserunning_out_rate: metric('baserunning_out_rate', 0.3, 20, 1) }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.priority).toBe('high');
  });
});

// ---- source-starved → silence -----------------------------------------------

describe('event families degrade honestly', () => {
  it('a player with NO event metrics emits no event-family signals', () => {
    const out = runBaseballEventFamilyGenerators(player({}));
    expect(out).toHaveLength(0);
  });

  it('every emitted candidate carries an honest causality_level + sourced drivers', () => {
    const out = runBaseballEventFamilyGenerators(
      player({
        baserunning_out_rate: metric('baserunning_out_rate', 0.3, 20, 1),
        catcher_pop_time: metric('catcher_pop_time', 2.3, 10, 0.49),
      }),
    );
    expect(out.length).toBeGreaterThanOrEqual(2);
    for (const c of out) {
      expect(c.evidence.causality_level).toBe('inferred_hypothesis');
      expect(c.evidence.diagnosis.drivers.length).toBeGreaterThan(0);
      expect(c.evidence.source_refs.length).toBeGreaterThan(0);
      expect(c.insightType.startsWith('coachhelm_')).toBe(true);
    }
  });
});

// ---- class / operations family ----------------------------------------------

describe('class/operations family', () => {
  it('class conflict fires on a recorded overlap as observed_sequence', () => {
    const out = classConflictGenerator({
      playerId: 'p1',
      practiceTitle: 'Infield block',
      conflictLabel: 'BIO 201 lab',
      conflictCount: 2,
      overlapMinutes: 40,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.priority).toBe('high');
    expect(out[0]!.evidence.causality_level).toBe('observed_sequence');
    expect(out[0]!.playerVisible).toBe(false);
  });

  it('missing-ack only fires past the unacknowledged-rate threshold', () => {
    // 1 of 5 unacknowledged = 0.2 < 0.4 threshold → no fire.
    expect(
      missingAcknowledgementGenerator({ playerId: 'p1', assignedCount: 5, acknowledgedCount: 4, seenCount: 5 }),
    ).toHaveLength(0);
    // 4 of 5 unacknowledged = 0.8 → fire, high.
    const out = missingAcknowledgementGenerator({ playerId: 'p1', assignedCount: 5, acknowledgedCount: 1, seenCount: 3 });
    expect(out).toHaveLength(1);
    expect(out[0]!.priority).toBe('high');
  });

  it('tasks-unseen is distinct from missing-ack (uses seenCount)', () => {
    const out = tasksUnseenGenerator({ playerId: 'p1', assignedCount: 6, acknowledgedCount: 0, seenCount: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.generator).toBe('tasks_unseen');
  });

  it('stale-source fires only past the staleness window', () => {
    expect(staleSourceDataGenerator({ playerId: 'p1', daysSinceRefresh: 10, staleLabel: 'profile' })).toHaveLength(0);
    const out = staleSourceDataGenerator({ playerId: 'p1', daysSinceRefresh: 50, staleLabel: 'profile' });
    expect(out).toHaveLength(1);
    expect(out[0]!.priority).toBe('high');
  });
});
