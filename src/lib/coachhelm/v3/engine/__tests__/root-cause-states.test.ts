/**
 * CoachHelm supercharge Slice 2: the three cause states `diagnoseRootCause`
 * writes into `evidence.cause`, on hand-built (synthetic) complete holes.
 *
 *   counted            → the raised floors (≥ 4 occurrences, ≥ 30% share)
 *   likely from totals → the corroboration gate (≥ 10 per arm, lift ≥ 1.25,
 *                        Newcombe lower bound > 0) with both arms printed
 *   not traced         → a data gap naming the one missing field, or no
 *                        leading path; never the old template
 *
 * The count-down, no-window, no-shot-path and load-failure variants are in
 * `src/test/coachhelm/v3/root-cause.test.ts`.
 */
import { describe, it, expect } from 'vitest';

import {
  dataGapFor,
  diagnoseRootCause,
  likelyFromTotals,
  observeSequence,
  sequenceTargetFor,
  topPath,
  type Occurrence,
  type RootCauseContext,
} from '../root-cause';
import { evaluateSlice, type Narrowing } from '../context-narrowing';
import type { HoleContext, ShotFact } from '../../context/types';

const TEMPLATE = /off its benchmark|inferred from the aggregate/;

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

function ctxOf(holes: HoleContext[], facts: ShotFact[]): RootCauseContext {
  return {
    facts,
    holes,
    scope: { player_id: 'p1', window_start: null, window_end: null, analysis_cutoff: '2026-12-31T00:00:00Z' },
    windowLabel: '2026-01-01 to 2026-12-31',
  };
}

const DIRECTIONS = ['short', 'long', 'left', 'right'] as const;

/**
 * Per round (4 rounds): 3 long par 4s where the 190-yd approach misses the
 * green and the chip and miss side vary (so no path repeats), and 4 long
 * par 3s from 200 yd, one missed. 175+ yd: 12 of 12 misses on long par 4s
 * against 4 of 16 on the par 3s.
 */
function approachFixture(): RootCauseContext {
  const holes: HoleContext[] = [];
  const facts: ShotFact[] = [];
  const leaves = [4, 12, 25];
  let i = 0;
  for (let r = 0; r < 4; r++) {
    const rid = `r${r}`;
    for (let h = 1; h <= 3; h++, i++) {
      const leave = leaves[i % 3]!;
      holes.push(hole(rid, h, 4, 440, 5));
      facts.push(shot(rid, h, 1, { shot_type: 'tee', lie_before: 'tee', distance_to_hole_before_feet: 1320, distance_to_hole_after_feet: 570, lie_after: 'fairway', result: 'fairway' }));
      facts.push(shot(rid, h, 2, { miss_direction: DIRECTIONS[Math.floor(i / 3) % 4]! }));
      facts.push(shot(rid, h, 3, { shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before_feet: 30, distance_to_hole_after_feet: leave, lie_after: 'green', result: 'green' }));
      facts.push(shot(rid, h, 4, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: leave, distance_to_hole_after_feet: 1, lie_after: 'green', result: 'green', putt_made: false }));
      facts.push(shot(rid, h, 5, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: 1, distance_to_hole_after_feet: 0, lie_after: 'green', result: 'hole', putt_made: true }));
    }
    for (let h = 4; h <= 7; h++) {
      const hit = h !== 7;
      holes.push(hole(rid, h, 3, 200, hit ? 3 : 4));
      facts.push(shot(rid, h, 1, { distance_to_hole_before_feet: 600, lie_before: 'tee', lie_after: hit ? 'green' : 'rough', result: hit ? 'green' : 'rough', distance_to_hole_after_feet: hit ? 25 : 30, miss_direction: hit ? null : 'long' }));
    }
  }
  return ctxOf(holes, facts);
}

const APPROACH_EVIDENCE = {
  metric: 'approach_proximity_175_plus_ft',
  metric_label: 'Greens hit from 175+ yds',
  unit: 'percent' as const,
  your_value: 43,
  your_value_display: '43%',
  comparison_value: 65,
  comparison_label: 'PGA Tour (approx)',
  sample_n: 28,
};

/**
 * Per round (4 rounds): 3 par 4s where the first putt from 8 ft misses and
 * the second is holed. The leave varies so no path repeats; `tagged` of the
 * 12 misses carry a miss direction (cycling short/long/left/right).
 */
function puttFixture(tagged: number): RootCauseContext {
  const holes: HoleContext[] = [];
  const facts: ShotFact[] = [];
  const leaves = [1, 4, 7];
  let i = 0;
  for (let r = 0; r < 4; r++) {
    const rid = `r${r}`;
    for (let h = 1; h <= 3; h++, i++) {
      const leave = leaves[i % 3]!;
      holes.push(hole(rid, h, 4, 400, 4));
      facts.push(shot(rid, h, 1, { shot_type: 'tee', lie_before: 'tee', distance_to_hole_before_feet: 1200, distance_to_hole_after_feet: 450, lie_after: 'fairway', result: 'fairway' }));
      facts.push(shot(rid, h, 2, { distance_to_hole_before_feet: 450, distance_to_hole_after_feet: 8, lie_after: 'green', result: 'green' }));
      facts.push(shot(rid, h, 3, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: 8, distance_to_hole_after_feet: leave, lie_after: 'green', result: 'green', putt_made: false, miss_direction: i < tagged ? DIRECTIONS[i % 4]! : null }));
      facts.push(shot(rid, h, 4, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: leave, distance_to_hole_after_feet: 0, lie_after: 'green', result: 'hole', putt_made: true }));
    }
  }
  return ctxOf(holes, facts);
}

const PUTT_EVIDENCE = {
  metric: 'putts_made_5_10ft_pct',
  metric_label: 'Putts made 5-10 ft',
  unit: 'percent' as const,
  your_value: 20,
  your_value_display: '20%',
  comparison_value: 50,
  comparison_label: 'PGA Tour',
  sample_n: 15,
};

describe('counted: the raised floors (≥ 4 occurrences and ≥ 30% of the population)', () => {
  const occ = (pattern: string, i: number): Occurrence => ({ round_id: `r${i}`, hole_number: 1, failed: true, pattern, strokes: null });
  const lead = 'approach missed short → chip to 6–20 ft → 2 putts';
  const population = (leading: number, total: number) => [
    ...Array.from({ length: leading }, (_, i) => occ(lead, i)),
    ...Array.from({ length: total - leading }, (_, i) => occ(`approach missed long → recovery ${i} → 2 putts`, 100 + i)),
  ];

  it('4 of 10 (40%) qualifies', () => {
    expect(topPath(population(4, 10), 2)).toMatchObject({ pattern: lead, count: 4 });
  });

  it('3 of 10 (PR #2073 would have taken it) does not', () => {
    expect(topPath(population(3, 10), 2)?.pattern).not.toBe(lead.split(' → ').slice(0, 2).join(' → '));
    expect(topPath(population(3, 10), 2)?.count).toBe(3);
    // …and observeSequence would mark it not observed: covered end to end below.
  });

  it('4 of 14 (29%) is under the share floor', () => {
    const top = topPath(population(4, 14), 2);
    // The leading full path is returned for the shortfall text, but it does not qualify.
    expect(top).toMatchObject({ pattern: lead, count: 4 });
    expect(top!.count / 14).toBeLessThan(0.3);
  });
});

describe('likely from totals', () => {
  it('a corroborated par × length association becomes the cause, with both arms printed', () => {
    const out = diagnoseRootCause({ metricId: APPROACH_EVIDENCE.metric, framing: 'leak', evidence: APPROACH_EVIDENCE, ctx: approachFixture() });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    expect(out.observation?.observed).toBe(false);
    expect(out.cause.state).toBe('inferred_hypothesis');
    expect(out.diagnosis.causality_level).toBe('inferred_hypothesis');
    const alt = out.cause.alternatives[0]!;
    expect(alt).toMatchObject({
      label: 'Green missed on long par 4s',
      arm_a: { n: 12, failures: 12, rate: 1 },
      arm_b: { n: 16, failures: 4, rate: 0.25 },
      lift: 4,
    });
    expect(alt.lower_bound).toBeGreaterThan(0);
    expect(out.diagnosis.root_cause).toMatch(
      /^Likely from the totals: on long par 4s, 12 of 12 approaches from 175\+ yd missed the green \(100%\) against 4 of 16 elsewhere \(25%\); difference \d+–\d+ points\. Not yet a counted sequence\.$/,
    );
    expect(out.diagnosis.root_cause).not.toMatch(TEMPLATE);
    expect(out.diagnosis.root_cause).not.toMatch(/because|caused/i);
    expect(out.cause.path).toBeNull();
    expect(out.diagnosis.drivers.filter((d) => d.metric.startsWith('cause_arm_')).map((d) => d.sample_n)).toEqual([12, 16]);
  });

  const narrowing = (slice: { attempts: number; failures: number }, total: { attempts: number; failures: number }) =>
    ({
      subject: 'approach',
      population: 'approaches from 175+ yd',
      slice: evaluateSlice({ par: 4, length: 'long' }, slice, total),
    }) as unknown as Narrowing;

  it('gate: each arm needs 10 attempts', () => {
    expect(likelyFromTotals(narrowing({ attempts: 12, failures: 12 }, { attempts: 21, failures: 14 }))).toBeNull();
    expect(likelyFromTotals(narrowing({ attempts: 12, failures: 12 }, { attempts: 22, failures: 14 }))).not.toBeNull();
  });

  it('gate: a lift inside the noise (Newcombe lower bound ≤ 0) is not corroborated', () => {
    // 8 of 14 (57%) vs 6 of 14 (43%): lift 1.33, 14 points, but the interval spans 0.
    expect(likelyFromTotals(narrowing({ attempts: 14, failures: 8 }, { attempts: 28, failures: 14 }))).toBeNull();
  });

  it('gate: no slice (the narrowing stopped) → no likely cause', () => {
    expect(likelyFromTotals(null)).toBeNull();
    expect(likelyFromTotals({ subject: 'approach', slice: null } as unknown as Narrowing)).toBeNull();
  });
});

describe('not traced: data gap and no leading path', () => {
  it('a field missing on most failures is named, with the one-tap prompt and its count', () => {
    const ctx = puttFixture(3);
    const out = diagnoseRootCause({ metricId: PUTT_EVIDENCE.metric, framing: 'leak', evidence: PUTT_EVIDENCE, ctx });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    expect(out.cause).toMatchObject({
      state: 'not_traced',
      not_traced_reason: 'data_gap',
      population: 'missed first putts from 5–10 ft',
      checked: { fields_missing: ['miss_direction'] },
      data_gap: {
        field: 'miss_direction',
        target_count: 10,
        have_count: 3,
        prompt: 'Which side? Short · Long · High · Low',
        shot_filter: { shot_type: 'putting', first_putt: true, distance_feet: [5, 10], holed: false },
      },
    });
    expect(out.diagnosis.root_cause).toBe(
      'Not traced yet: 9 of 12 missed first putts from 5–10 ft have no record of which side the putt missed. One tap on the next 10 fills it.',
    );
    expect(out.diagnosis.recommended_action).toBe('Tag which side the putt missed on the next 10 missed first putts from 5–10 ft');
    expect(out.diagnosis.causality_level).toBe('inferred_hypothesis');
  });

  it('dataGapFor: the target lifts the current population past 60% and is never under 10', () => {
    const obs = observeSequence(sequenceTargetFor(PUTT_EVIDENCE.metric)!, puttFixture(3).facts, puttFixture(3).holes, puttFixture(3).scope);
    expect(obs.fieldCoverage).toEqual([
      { field: 'miss_direction', have: 3, of: 12 },
      { field: 'distance_to_hole_after', have: 12, of: 12 },
    ]);
    expect(dataGapFor({ ...obs, fieldCoverage: [{ field: 'miss_direction', have: 5, of: 30 }] })?.target_count).toBe(18);
    expect(dataGapFor({ ...obs, fieldCoverage: [{ field: 'miss_direction', have: 8, of: 12 }] })).toBeNull();
  });

  it('every field recorded but no path leads → says so, naming the most common path', () => {
    const out = diagnoseRootCause({ metricId: PUTT_EVIDENCE.metric, framing: 'leak', evidence: PUTT_EVIDENCE, ctx: puttFixture(12) });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    expect(out.cause).toMatchObject({ state: 'not_traced', not_traced_reason: 'no_leading_path', data_gap: null });
    expect(out.diagnosis.root_cause).toMatch(
      /^Not traced yet: 12 missed first putts from 5–10 ft over 4 rounds checked, and no single path accounts for 4 of them and 30% \(most common: ".+", 1 of 12\)\.$/,
    );
    expect(out.diagnosis.root_cause).not.toMatch(TEMPLATE);
  });
});
