/**
 * Root-cause diagnosis (`engine/root-cause.ts`) — one test per branch, on the
 * A0 / A10 shadow-eval fixtures (real A1 hole sequences, real A4
 * attribution, real A3/A5 cores — no hand-picked numbers).
 *
 *   strength/neutral → no diagnosis
 *   leak + a repeated recorded path clearing every floor → observed_sequence
 *   leak + floors not met → inferred_hypothesis naming what was checked
 *   leak + an A5 family (par-5) → hypothesis_policy with its label
 *   leak + no sequence family / load failure → honest aggregate_only
 *
 * And the invariant the whole change exists for: no branch ever emits the
 * old "is off its benchmark — likely cause inferred from the aggregate"
 * template.
 */
import { describe, it, expect } from 'vitest';

import {
  diagnoseRootCause,
  observeSequence,
  resolveInsightFraming,
  scopeForEvidence,
  sequenceTargetFor,
  topPath,
  type Occurrence,
  type RootCauseContext,
} from '@/lib/coachhelm/v3/engine/root-cause';
import type { HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import type { ShadowSnapshot } from '@/lib/coachhelm/v3/eval/shadow-harness';
import {
  establishedRosterComplete,
  newRosterComplete,
} from './fixtures/shadow-eval-snapshots';

const TEMPLATE = /off its benchmark|inferred from the aggregate/;

function ctxOf(snap: ShadowSnapshot): RootCauseContext {
  return { facts: snap.facts, holes: snap.holes, scope: snap.scope, windowLabel: '2026-05-01 to 2026-07-31' };
}

const APPROACH_EVIDENCE = {
  metric: 'approach_proximity_50_125ft',
  metric_label: 'Greens hit from 50-125 yds',
  unit: 'percent' as const,
  your_value: 20,
  your_value_display: '20%',
  comparison_value: 80,
  comparison_label: 'PGA Tour (approx)',
  sample_n: 13,
};

describe('resolveInsightFraming', () => {
  const base = { metric: 'putts_made_5_10ft_pct', unit: 'percent' as const, your_value: 40, comparison_value: 60 };

  it('a generator-declared framing wins over the values (the "Driver is performing" row)', () => {
    // 66.1 vs 66.7 with higher_better reads as "worse" by value, but the
    // generator's verdict is a strength.
    expect(
      resolveInsightFraming('strength', {
        metric: 'sg_ott',
        unit: 'percent',
        polarity: 'higher_better',
        your_value: 66.1,
        comparison_value: 66.7,
      }),
    ).toBe('strength');
  });

  it('value-based: worse than the benchmark is a leak, at/better is a strength', () => {
    expect(resolveInsightFraming(undefined, base)).toBe('leak');
    expect(resolveInsightFraming(undefined, { ...base, your_value: 60 })).toBe('strength');
    expect(resolveInsightFraming(undefined, { ...base, your_value: 70 })).toBe('strength');
    // lower_better registry metric
    expect(
      resolveInsightFraming(undefined, { metric: 'penalty_rate_per_round', unit: 'count', your_value: 0, comparison_value: 0.3 }),
    ).toBe('strength');
  });

  it('untrustworthy polarity (unit disagrees with the registry) stays a leak — never hides a problem', () => {
    // sg_ott is registered in strokes; this row carries a fairway percent.
    expect(
      resolveInsightFraming(undefined, { metric: 'sg_ott', unit: 'percent', your_value: 90, comparison_value: 50 }),
    ).toBe('leak');
  });
});

describe('diagnoseRootCause — strength/neutral', () => {
  it('returns no diagnosis for a strength or a neutral reading', () => {
    for (const framing of ['strength', 'neutral'] as const) {
      const out = diagnoseRootCause({
        metricId: 'approach_proximity_50_125ft',
        framing,
        evidence: APPROACH_EVIDENCE,
        ctx: ctxOf(establishedRosterComplete),
      });
      expect(out).toEqual({ kind: 'none', reason: framing });
    }
  });
});

describe('diagnoseRootCause — observed shot sequence', () => {
  it('states the repeated path with its count and denominator when every floor clears', () => {
    const out = diagnoseRootCause({
      metricId: 'approach_proximity_50_125ft',
      framing: 'leak',
      evidence: APPROACH_EVIDENCE,
      ctx: ctxOf(establishedRosterComplete),
    });
    expect(out.kind).toBe('diagnosis');
    if (out.kind !== 'diagnosis') return;
    const d = out.diagnosis;
    expect(d.causality_level).toBe('observed_sequence');
    // 10 approach→recovery holes (chip to 5 ft, 1 putt) + 3 par-5 third
    // shots from 50 yd (chip to 8 ft, 1 putt) all miss the green from the
    // 50-125 yd band: the recorded path repeats 10 of 13 times.
    expect(d.basis?.kind).toBe('shot_sequence');
    expect(d.basis?.sequence).toMatchObject({
      pattern: 'approach missed → chip to inside 6 ft → 1 putt',
      occurrences: 10,
      of: 13,
      distinct_rounds: 3,
    });
    expect(d.root_cause).toContain('approach missed → chip to inside 6 ft → 1 putt — 10 of 13 missed greens from 50–125 yd');
    expect(d.root_cause).not.toMatch(TEMPLATE);
    // Temporal, never causal.
    expect(d.root_cause).not.toMatch(/caused|because|proven/i);
    // Drivers carry the count/denominator and the A4 strokes figure.
    const share = d.drivers.find((x) => x.metric === 'sequence_pattern_share');
    expect(share).toMatchObject({ value: 77, sample_n: 13 });
    expect(d.drivers.some((x) => x.metric === 'sequence_event_strokes_gained' && x.unit === 'strokes')).toBe(true);
  });

  it('the A10 gate off keeps the same checks but ships an honest hypothesis instead', () => {
    const out = diagnoseRootCause({
      metricId: 'approach_proximity_50_125ft',
      framing: 'leak',
      evidence: APPROACH_EVIDENCE,
      ctx: ctxOf(establishedRosterComplete),
      observedEnabled: false,
    });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    expect(out.diagnosis.causality_level).toBe('inferred_hypothesis');
    expect(out.observation?.observed).toBe(true);
    expect(out.diagnosis.root_cause).not.toMatch(TEMPLATE);
  });
});

describe('diagnoseRootCause — floors not met', () => {
  it('a new roster (one round) names each shortfall against its real floor', () => {
    const out = diagnoseRootCause({
      metricId: 'approach_proximity_50_125ft',
      framing: 'leak',
      evidence: APPROACH_EVIDENCE,
      ctx: ctxOf(newRosterComplete),
    });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    const d = out.diagnosis;
    expect(d.causality_level).toBe('inferred_hypothesis');
    expect(d.root_cause).toContain('Not yet traced to a repeated shot sequence');
    expect(d.root_cause).toContain('2 missed greens from 50–125 yd across 1 round (need 10 over 3 rounds)');
    expect(d.root_cause).not.toMatch(TEMPLATE);
    expect(d.basis?.checked).toContain('2 of 2 holes have complete shot records');
  });

  it('observeSequence never passes on a population below the event/round floor even when the path is unanimous', () => {
    const obs = observeSequence(
      sequenceTargetFor('approach_proximity_50_125ft')!,
      newRosterComplete.facts,
      newRosterComplete.holes,
      newRosterComplete.scope,
    );
    expect(obs.failures).toBe(2);
    expect(obs.observed).toBe(false);
  });
});

describe('diagnoseRootCause — A5 controlled hypothesis', () => {
  it('par-5 scoring with no over-par sequence falls back to A5 par5_opportunity_loss with its label', () => {
    const out = diagnoseRootCause({
      metricId: 'scoring_par_5',
      framing: 'leak',
      evidence: {
        metric: 'scoring_par_5',
        metric_label: 'Par 5 Scoring',
        unit: 'strokes',
        your_value: 5,
        your_value_display: '5.00',
        comparison_value: 4.7,
        comparison_label: 'PGA Tour',
        sample_n: 3,
      },
      ctx: ctxOf(establishedRosterComplete),
    });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    const d = out.diagnosis;
    expect(d.causality_level).toBe('inferred_hypothesis');
    expect(d.basis?.kind).toBe('hypothesis_policy');
    expect(d.basis?.hypothesis_label).toBe('corroborated');
    expect(d.root_cause).toContain('Working hypothesis (corroborated association)');
    expect(d.basis?.checked.some((l) => l.startsWith('A5 par5_opportunity_loss: corroborated'))).toBe(true);
    expect(d.root_cause).not.toMatch(TEMPLATE);
  });
});

describe('diagnoseRootCause — no sequence family / load failure', () => {
  const PRESSURE = {
    metric: 'practice_tournament_delta',
    metric_label: 'Practice vs Tournament Delta',
    unit: 'strokes' as const,
    your_value: 3,
    your_value_display: '+3.0',
    comparison_value: 0.5,
    comparison_label: 'PGA Tour',
    sample_n: 8,
  };

  it('a metric no recorded shot path measures says so, specifically', () => {
    const out = diagnoseRootCause({ metricId: 'practice_tournament_delta', framing: 'leak', evidence: PRESSURE, ctx: null });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    expect(out.diagnosis.basis?.kind).toBe('aggregate_only');
    expect(out.diagnosis.root_cause).toBe(
      'Not traceable to a shot sequence: no recorded shot path measures practice vs tournament delta.',
    );
  });

  it('a failed shot load is stated, not disguised as a finding', () => {
    const out = diagnoseRootCause({
      metricId: 'approach_proximity_50_125ft',
      framing: 'leak',
      evidence: APPROACH_EVIDENCE,
      ctx: null,
      loadFailed: true,
    });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    expect(out.diagnosis.root_cause).toContain('the shot records could not be read for this run');
    expect(out.diagnosis.causality_level).toBe('inferred_hypothesis');
  });
});

describe('sequence families on hand-built holes', () => {
  function shot(o: Partial<ShotFact> & Pick<ShotFact, 'round_id' | 'hole_number' | 'shot_number'>): ShotFact {
    return {
      shot_type: 'unknown', club_type: null, intent: 'unknown',
      distance_to_hole_before_feet: null, distance_to_hole_after_feet: null,
      lie_before: null, lie_after: null, result: null, is_penalty: false, putt_made: null,
      miss_direction: null, observed_at: '2026-06-01T00:00:00.000Z',
      ...o,
    };
  }
  /** Par 4: re-tee penalty recorded as shot 1 (the production shape), then
   *  tee, approach on, two putts — a bogey. */
  function reTeeHole(round_id: string, hole_number: number): { hole: HoleContext; facts: ShotFact[] } {
    return {
      hole: { round_id, course_id: null, hole_number, par: 4, total_strokes: 5, penalty_strokes: 1, putts: 2, gir: null, yardage: null },
      facts: [
        shot({ round_id, hole_number, shot_number: 1, shot_type: 'unknown', is_penalty: true, lie_before: 'tee', distance_to_hole_before_feet: 1200, lie_after: 'tee', distance_to_hole_after_feet: 1200, result: 'penalty' }),
        shot({ round_id, hole_number, shot_number: 2, shot_type: 'tee', club_type: 'driver', lie_before: 'tee', distance_to_hole_before_feet: 1200, lie_after: 'fairway', distance_to_hole_after_feet: 400, result: 'fairway' }),
        shot({ round_id, hole_number, shot_number: 3, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before_feet: 400, lie_after: 'green', distance_to_hole_after_feet: 25, result: 'green' }),
        shot({ round_id, hole_number, shot_number: 4, shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: 25, lie_after: 'green', distance_to_hole_after_feet: 2, result: 'green' }),
        shot({ round_id, hole_number, shot_number: 5, shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: 2, lie_after: 'hole', distance_to_hole_after_feet: 0, result: 'hole', putt_made: true }),
      ],
    };
  }
  const built = ['r1', 'r2', 'r3', 'r4'].flatMap((r) => [1, 2, 3].map((h) => reTeeHole(r, h)));
  const facts = built.flatMap((b) => b.facts);
  const holes = built.map((b) => b.hole);
  const scope = { player_id: 'p', window_start: null, window_end: null, analysis_cutoff: '2026-08-01T00:00:00.000Z' };

  it('penalty: a shot-1 re-tee penalty reads "tee shot → penalty (re-tee)", 12 of 12', () => {
    const obs = observeSequence(sequenceTargetFor('penalty_rate_per_round')!, facts, holes, scope);
    expect(obs.failures).toBe(12);
    expect(obs.top).toMatchObject({ pattern: 'tee shot → penalty (re-tee)', count: 12, rounds: 4 });
    expect(obs.observed).toBe(true);
  });

  it('over-par par 4s: the path names the costly events on each bogey; big-number finds none', () => {
    const obs = observeSequence(sequenceTargetFor('scoring_par_4')!, facts, holes, scope);
    expect(obs.failures).toBe(12);
    expect(obs.top?.pattern.startsWith('penalty')).toBe(true);
    // Bogeys are not double bogeys — the big-number population is empty.
    expect(observeSequence(sequenceTargetFor('big_number_rate')!, facts, holes, scope).failures).toBe(0);
  });
});

describe('topPath', () => {
  const occ = (pattern: string, round_id: string): Occurrence => ({ round_id, hole_number: 1, failed: true, pattern, strokes: null });

  it('reports the longest prefix that clears the repeat floors when full paths fragment', () => {
    const failed = [
      occ('approach missed short → chip to 6–20 ft → 2 putts', 'a'),
      occ('approach missed short → chip to 6–20 ft → 1 putt', 'b'),
      occ('approach missed short → chip to 6–20 ft → 3 putts', 'c'),
      occ('approach missed long → chip to 20+ ft → 2 putts', 'd'),
    ];
    // No full path repeats, but the 2-step prefix does (3 of 4).
    expect(topPath(failed, 2)).toEqual({ pattern: 'approach missed short → chip to 6–20 ft', count: 3, rounds: 3 });
  });

  it('never reports a prefix shorter than the family minimum', () => {
    const failed = [
      occ('approach missed short → chip to 6–20 ft → 2 putts', 'a'),
      occ('approach missed short → chip to 20+ ft → 1 putt', 'b'),
      occ('approach missed short → bunker shot to inside 6 ft → 1 putt', 'c'),
    ];
    const top = topPath(failed, 2);
    // "approach missed short" (1 step) would qualify 3 of 3 but is below the
    // 2-step minimum; no 2-step prefix repeats 3 times → falls back to the
    // most common full path, which does not qualify.
    expect(top?.pattern.split(' → ').length).toBeGreaterThanOrEqual(2);
    expect(top?.count).toBe(1);
  });
});

describe('scopeForEvidence', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  it('uses the evidence window when both ends are set', () => {
    expect(scopeForEvidence('p', { window_start: '2026-01-01', window_end: '2026-06-30', window_days: 0 }, now).label).toBe(
      '2026-01-01 to 2026-06-30',
    );
  });
  it('derives the start from window_days when window_start is blank (approach-miss stamps "")', () => {
    const { scope, label } = scopeForEvidence('p', { window_start: '', window_end: '', window_days: 90 }, now);
    expect(label).toBe('2026-06-26 to 2026-09-24');
    expect(scope.player_id).toBe('p');
  });
  it('falls back to a rolling 12 months', () => {
    expect(scopeForEvidence('p', { window_start: '', window_end: '', window_days: 0 }, now).label).toBe('2025-09-24 to 2026-09-24');
  });
});
