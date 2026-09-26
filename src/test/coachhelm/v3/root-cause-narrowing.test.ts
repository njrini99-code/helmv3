/**
 * Root cause × context narrowing (2026-09-25): the narrowing leads the
 * hypothesis text with its counts, rides on `basis.narrowing`, never raises
 * causality on its own, and the approach sequence population leaves 175+
 * par-5 lay-ups out (A2's rule).
 */
import { describe, it, expect } from 'vitest';

import {
  diagnoseRootCause,
  narrowingFor,
  observeSequence,
  sequenceTargetFor,
  type RootCauseContext,
} from '@/lib/coachhelm/v3/engine/root-cause';
import { mergeDiagnosis } from '@/lib/coachhelm/v3/engine/generator-base';
import type { HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';

function hole(round: string, n: number, par: number, yardage: number, total: number): HoleContext {
  return { round_id: round, course_id: 'c1', hole_number: n, par, yardage, total_strokes: total, penalty_strokes: 0, putts: 2, gir: null };
}

function shot(round: string, n: number, num: number, over: Partial<ShotFact>): ShotFact {
  return {
    round_id: round,
    hole_number: n,
    shot_number: num,
    shot_type: 'approach',
    club_type: 'non_driver',
    intent: 'unknown',
    distance_to_hole_before_feet: 570,
    distance_to_hole_after_feet: 30,
    lie_before: 'fairway',
    lie_after: 'rough',
    result: 'rough',
    is_penalty: false,
    putt_made: null,
    miss_direction: null,
    observed_at: '2026-07-01T00:00:00Z',
    ...over,
  };
}

/** Per round: 3 long par 4s missing short-right from 190 yd (chip + 2
 *  putts), 4 par 3s from 195 mostly hit, 1 par-5 lay-up from 230. */
function ctx(): RootCauseContext {
  const holes: HoleContext[] = [];
  const facts: ShotFact[] = [];
  for (let r = 0; r < 4; r++) {
    const rid = `r${r}`;
    for (let h = 1; h <= 3; h++) {
      holes.push(hole(rid, h, 4, 440, 5));
      facts.push(shot(rid, h, 1, { shot_type: 'tee', lie_before: 'tee', distance_to_hole_before_feet: 1320, distance_to_hole_after_feet: 570, lie_after: 'fairway', result: 'fairway' }));
      facts.push(shot(rid, h, 2, { miss_direction: 'short_right' }));
      facts.push(shot(rid, h, 3, { shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before_feet: 30, distance_to_hole_after_feet: 12, lie_after: 'green', result: 'green' }));
      facts.push(shot(rid, h, 4, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: 12, distance_to_hole_after_feet: 2, lie_after: 'green', result: 'green', putt_made: false }));
      facts.push(shot(rid, h, 5, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: 2, distance_to_hole_after_feet: 0, lie_after: 'green', result: 'hole', putt_made: true }));
    }
    for (let h = 4; h <= 7; h++) {
      const hit = h !== 7;
      holes.push(hole(rid, h, 3, 200, hit ? 3 : 4));
      facts.push(shot(rid, h, 1, { distance_to_hole_before_feet: 585, lie_before: 'tee', lie_after: hit ? 'green' : 'rough', result: hit ? 'green' : 'rough', distance_to_hole_after_feet: hit ? 25 : 30, miss_direction: hit ? null : 'long' }));
    }
    holes.push(hole(rid, 8, 5, 560, 5));
    // A complete par-5 hole (so the sequence attribution reads it): tee, a
    // lay-up from 230 yd to the fairway, a wedge on, two putts.
    facts.push(shot(rid, 8, 1, { shot_type: 'tee', lie_before: 'tee', distance_to_hole_before_feet: 1680, distance_to_hole_after_feet: 690, lie_after: 'fairway', result: 'fairway' }));
    facts.push(shot(rid, 8, 2, { distance_to_hole_before_feet: 690, distance_to_hole_after_feet: 270, lie_after: 'fairway', result: 'fairway', miss_direction: 'right' }));
    facts.push(shot(rid, 8, 3, { distance_to_hole_before_feet: 270, distance_to_hole_after_feet: 15, lie_after: 'green', result: 'green' }));
    facts.push(shot(rid, 8, 4, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: 15, distance_to_hole_after_feet: 1, lie_after: 'green', result: 'green', putt_made: false }));
    facts.push(shot(rid, 8, 5, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: 1, distance_to_hole_after_feet: 0, lie_after: 'green', result: 'hole', putt_made: true }));
  }
  return {
    facts,
    holes,
    scope: { player_id: 'p1', window_start: '2026-01-01', window_end: '2026-12-31', analysis_cutoff: '2026-12-31T00:00:00Z' },
    windowLabel: '2026-01-01 to 2026-12-31',
  };
}

const EVIDENCE = {
  metric: 'approach_proximity_175_plus_ft',
  metric_label: 'Greens hit from 175+ yds',
  unit: 'percent' as const,
  your_value: 57,
  your_value_display: '57%',
  comparison_value: 65,
  comparison_label: 'PGA Tour (approx)',
  sample_n: 28,
};

describe('root cause × context narrowing', () => {
  it('175+ approach: narrowing path 175+ yd → long par 4s → short-right, counts in the text, basis carries it', () => {
    const out = diagnoseRootCause({ metricId: EVIDENCE.metric, framing: 'leak', evidence: EVIDENCE, ctx: ctx(), observedEnabled: false });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    const d = out.diagnosis;
    expect(d.causality_level).toBe('inferred_hypothesis');
    expect(d.basis?.narrowing?.path).toEqual(['175+ yd', 'long par 4s', 'short-right']);
    expect(d.root_cause).toMatch(/^Observed, not a cause: 16 of 28 approaches from 175\+ yd missed the green/);
    expect(d.root_cause).toContain('12 of 16 misses came on long par 4s');
    expect(d.basis?.checked.some((l) => l.startsWith('shape: most misses on long par 4s finish short-right'))).toBe(true);
  });

  it('the narrowing never raises causality: it rides an observed sequence, it does not make one', () => {
    const out = diagnoseRootCause({ metricId: EVIDENCE.metric, framing: 'leak', evidence: EVIDENCE, ctx: ctx(), observedEnabled: true });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    // 12 failures over 4 rounds clears the A4 population floor; whatever the
    // sequence branch decides, the narrowing is attached, not the decider.
    expect(out.diagnosis.basis?.narrowing).toBeDefined();
    expect(out.diagnosis.causality_level).toBe(out.observation?.observed ? 'observed_sequence' : 'inferred_hypothesis');
  });

  it('175+ sequence population leaves par-5 lay-ups out (A2 rule)', () => {
    const c = ctx();
    const obs = observeSequence(sequenceTargetFor(EVIDENCE.metric)!, c.facts, c.holes, c.scope);
    // Complete holes only (par 3s here are single-shot, so not attributable):
    // 3 par-4 misses per round = 12. The 4 par-5 lay-ups from 230 yd that
    // finished in the fairway are not "missed greens" (16 before the fix).
    expect(obs.failures).toBe(12);
  });

  it('no narrowing for metrics outside approach / tee / par scoring', () => {
    const c = ctx();
    expect(narrowingFor(sequenceTargetFor('putts_made_5_10ft_pct'), c.facts, c.holes)).toBeNull();
    expect(narrowingFor(sequenceTargetFor('penalty_rate_per_round'), c.facts, c.holes)).toBeNull();
    expect(narrowingFor(sequenceTargetFor('scoring_par_3'), c.facts, c.holes)?.subject).toBe('par_scoring');
    expect(narrowingFor(sequenceTargetFor('sg_ott'), c.facts, c.holes)?.subject).toBe('tee');
  });

  it('mergeDiagnosis: a generator reading keeps its text, led by a narrowing that passed its population gate', () => {
    const out = diagnoseRootCause({ metricId: EVIDENCE.metric, framing: 'leak', evidence: EVIDENCE, ctx: ctx(), observedEnabled: false });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    const base = { symptom: 's', root_cause: 'b', causality_level: 'inferred_hypothesis' as const, drivers: [], recommended_action: 'a', confidence_reason: 'c' };
    const merged = mergeDiagnosis(base, { ...base, root_cause: 'The record does not say why.' }, out.diagnosis)!;
    expect(merged.root_cause).toMatch(/^Observed, not a cause: .* The record does not say why\.$/);
    expect(merged.causality_level).toBe('inferred_hypothesis');
    expect(merged.basis?.narrowing?.path[1]).toBe('long par 4s');
  });
});
