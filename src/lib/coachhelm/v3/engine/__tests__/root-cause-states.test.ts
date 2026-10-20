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
  bonferroniZ,
  costlyPath,
  dataGapFor,
  dataGapTagsNeeded,
  diagnoseRootCause,
  LIKELY_MIN_LIFT,
  likelyFromTotals,
  MIN_PATTERN_ROUNDS,
  notTraced,
  observeSequence,
  rollingWindowEvidence,
  scopeForEvidence,
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
    // topPath still returns the leading full path (for the shortfall text);
    // it is not a QUALIFYING path, so observeSequence marks it not observed.
    expect(topPath(population(3, 10), 2)?.count).toBe(3);
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

  const narrowing = (
    slice: { attempts: number; failures: number },
    total: { attempts: number; failures: number },
    looks = 1,
  ) =>
    ({
      subject: 'approach',
      population: 'approaches from 175+ yd',
      slice: evaluateSlice({ par: 4, length: 'long' }, slice, total),
      sliceChecks: Array.from({ length: looks }, () => null),
    }) as unknown as Narrowing;

  it('gate: the lift floor (1.25) is enforced even when the interval clears 0', () => {
    // 95 of 100 vs 80 of 100: 15 points, interval above 0, but lift 1.19.
    expect(LIKELY_MIN_LIFT).toBe(1.25);
    expect(likelyFromTotals(narrowing({ attempts: 100, failures: 95 }, { attempts: 200, failures: 175 }))).toBeNull();
    // 60 of 100 vs 40 of 100: lift 1.5, interval above 0 → likely.
    expect(likelyFromTotals(narrowing({ attempts: 100, failures: 60 }, { attempts: 200, failures: 100 }))).not.toBeNull();
  });

  it('gate: the interval is widened for the slices the narrowing tried (Bonferroni)', () => {
    // 10 of 14 vs 6 of 20: clears 0 at one look (lower ≈ 7 points) …
    expect(likelyFromTotals(narrowing({ attempts: 14, failures: 10 }, { attempts: 34, failures: 16 }, 1))).not.toBeNull();
    // … but not as the best of 9 slices tried (lower ≈ −5 points).
    expect(likelyFromTotals(narrowing({ attempts: 14, failures: 10 }, { attempts: 34, failures: 16 }, 9))).toBeNull();
    expect(bonferroniZ(1)).toBeCloseTo(1.96, 2);
    expect(bonferroniZ(9)).toBeCloseTo(2.77, 2);
  });

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
        target_count: 11,
        have_count: 3,
        prompt: 'Which side? Short · Long · High · Low',
        shot_filter: { shot_type: 'putting', first_putt: true, distance_feet: [5, 10], holed: false },
      },
    });
    expect(out.diagnosis.root_cause).toBe(
      'Not traced yet: 9 of 12 missed first putts from 5–10 ft have no record of which side the putt missed. One tap on the next 11 fills it.',
    );
    expect(out.diagnosis.recommended_action).toBe('Tag which side the putt missed on the next 11 missed first putts from 5–10 ft');
    expect(out.diagnosis.causality_level).toBe('inferred_hypothesis');
  });

  it('dataGapFor: the target is how many of the NEXT failures must be tagged to reach 60%', () => {
    const obs = observeSequence(sequenceTargetFor(PUTT_EVIDENCE.metric)!, puttFixture(3).facts, puttFixture(3).holes, puttFixture(3).scope);
    expect(obs.fieldCoverage).toEqual([
      { field: 'miss_direction', have: 3, of: 12 },
      { field: 'distance_to_hole_after', have: 12, of: 12 },
    ]);
    // 5 of 30 tagged: 18 more (60% of today's 30) would give 23 of 48 (48%).
    // 33 more gives 38 of 63 (60.3%); 32 gives 37 of 62 (59.7%).
    expect(dataGapFor({ ...obs, fieldCoverage: [{ field: 'miss_direction', have: 5, of: 30 }] })?.target_count).toBe(33);
    expect(dataGapFor({ ...obs, fieldCoverage: [{ field: 'miss_direction', have: 8, of: 12 }] })).toBeNull();
  });

  it('dataGapTagsNeeded is the smallest count that clears the gate once the new failures are counted', () => {
    for (let of = 1; of <= 60; of++) {
      for (let have = 0; have < of; have++) {
        if (have / of >= 0.6) continue;
        const x = dataGapTagsNeeded(have, of);
        expect((have + x) / (of + x)).toBeGreaterThanOrEqual(0.6);
        if (x > 1) expect((have + x - 1) / (of + x - 1)).toBeLessThan(0.6);
      }
    }
    expect(dataGapTagsNeeded(5, 30)).toBe(33);
    expect(dataGapTagsNeeded(3, 12)).toBe(11);
  });

  it('every field recorded but no path leads → says so, naming the most common path', () => {
    const out = diagnoseRootCause({ metricId: PUTT_EVIDENCE.metric, framing: 'leak', evidence: PUTT_EVIDENCE, ctx: puttFixture(12) });
    if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
    expect(out.cause).toMatchObject({ state: 'not_traced', not_traced_reason: 'no_leading_path', data_gap: null });
    expect(out.diagnosis.root_cause).toMatch(
      /^Not traced yet: 12 missed first putts from 5–10 ft over 4 rounds checked, and no single path accounts for 4 of them and 30% across 2 rounds \(most common: ".+", 1 of 12\)\.$/,
    );
    expect(out.diagnosis.root_cause).not.toMatch(TEMPLATE);
  });
});

/** One complete par 4: tee, approach to 8 ft, a missed first putt that stops
 *  `leave` ft away (null = not recorded), then `more` putts to hole out. */
function puttHole(rid: string, h: number, leave: number | null, more: 1 | 2, dir: string | null) {
  const holeRow = hole(rid, h, 4, 400, 3 + more);
  const facts: ShotFact[] = [
    shot(rid, h, 1, { shot_type: 'tee', lie_before: 'tee', distance_to_hole_before_feet: 1200, distance_to_hole_after_feet: 450, lie_after: 'fairway', result: 'fairway' }),
    shot(rid, h, 2, { distance_to_hole_before_feet: 450, distance_to_hole_after_feet: 8, lie_after: 'green', result: 'green' }),
    shot(rid, h, 3, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: 8, distance_to_hole_after_feet: leave, lie_after: 'green', result: 'green', putt_made: false, miss_direction: dir }),
  ];
  const second = leave ?? 4;
  if (more === 1) {
    facts.push(shot(rid, h, 4, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: second, distance_to_hole_after_feet: 0, lie_after: 'green', result: 'hole', putt_made: true }));
  } else {
    facts.push(shot(rid, h, 4, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: second, distance_to_hole_after_feet: 1, lie_after: 'green', result: 'green', putt_made: false }));
    facts.push(shot(rid, h, 5, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before_feet: 1, distance_to_hole_after_feet: 0, lie_after: 'green', result: 'hole', putt_made: true }));
  }
  return { hole: holeRow, facts };
}

function puttCtx(rows: Array<[round: string, leave: number | null, more: 1 | 2, dir: string | null]>): RootCauseContext {
  const holes: HoleContext[] = [];
  const facts: ShotFact[] = [];
  const perRound = new Map<string, number>();
  for (const [rid, leave, more, dir] of rows) {
    const h = (perRound.get(rid) ?? 0) + 1;
    perRound.set(rid, h);
    const built = puttHole(rid, h, leave, more, dir);
    holes.push(built.hole);
    facts.push(...built.facts);
  }
  return ctxOf(holes, facts);
}

/** Six misses with six different paths, spread over rounds r1–r3. */
const SCATTERED: Array<[string, number | null, 1 | 2, string | null]> = [
  ['r1', 8, 1, 'short'],
  ['r1', 8, 1, 'long'],
  ['r2', 8, 1, 'left'],
  ['r2', 8, 1, 'right'],
  ['r3', 12, 1, 'short'],
  ['r3', 12, 1, 'long'],
];

const run = (ctx: RootCauseContext) => {
  const out = diagnoseRootCause({ metricId: PUTT_EVIDENCE.metric, framing: 'leak', evidence: PUTT_EVIDENCE, ctx });
  if (out.kind !== 'diagnosis') throw new Error('expected a diagnosis');
  return out;
};

describe('review fixes (#2221): what may not be counted', () => {
  it('S8: a repeated path must span at least 2 rounds (one round is one day)', () => {
    expect(MIN_PATTERN_ROUNDS).toBe(2);
    const sameDay = run(puttCtx([...Array.from({ length: 6 }, () => ['r0', 4, 2, 'short'] as [string, number, 2, string]), ...SCATTERED]));
    expect(sameDay.cause.state).toBe('not_traced');
    expect(sameDay.cause.not_traced_reason).toBe('no_leading_path');

    const twoDays = run(
      puttCtx([
        ...Array.from({ length: 3 }, () => ['r0', 4, 2, 'short'] as [string, number, 2, string]),
        ...Array.from({ length: 3 }, () => ['r1', 4, 2, 'short'] as [string, number, 2, string]),
        ...SCATTERED,
      ]),
    );
    expect(twoDays.cause.state).toBe('observed_sequence');
    expect(twoDays.cause.path).toEqual(['first putt missed short, leaving 3–6 ft', '2 more putts']);
    expect(twoDays.cause.distinct_rounds).toBe(2);
  });

  it('S1: an unrecorded leave is not a path; 5 of 12 unrecorded is a data gap, not "Measured"', () => {
    const out = run(puttCtx([...Array.from({ length: 5 }, (_, i) => [`r${i % 3}`, null, 1, 'short'] as [string, null, 1, string]), ...SCATTERED, ['r3', 15, 1, 'left']]));
    expect(out.cause.state).toBe('not_traced');
    expect(out.cause.not_traced_reason).toBe('data_gap');
    expect(out.cause.data_gap).toMatchObject({ field: 'distance_to_hole_after', have_count: 7 });
    expect(out.diagnosis.root_cause).not.toMatch(/unrecorded distance/);
  });

  it('S1: at 4 of 12 unrecorded (coverage 67%, above the 60% gate) it is still never counted', () => {
    const out = run(puttCtx([...Array.from({ length: 4 }, (_, i) => [`r${i % 3}`, null, 1, 'short'] as [string, null, 1, string]), ...SCATTERED, ['r3', 15, 1, 'left'], ['r3', 15, 1, 'right']]));
    expect(out.cause.state).toBe('not_traced');
    expect(out.cause.not_traced_reason).toBe('no_leading_path');
  });

  it('S4: the ordinary miss (tap-in left, holed next) is not a counted cause', () => {
    const out = run(puttCtx([...Array.from({ length: 6 }, (_, i) => [`r${i % 3}`, 1, 1, 'short'] as [string, number, 1, string]), ...SCATTERED]));
    expect(out.cause.state).toBe('not_traced');
    expect(out.diagnosis.root_cause).not.toMatch(/inside 3 ft → holed the next putt/);
  });

  it('S4: putting actions name no stroke mechanics; only 25+ ft gets the (sourced) pace line', () => {
    const counted = run(
      puttCtx([
        ...Array.from({ length: 3 }, () => ['r0', 4, 2, 'short'] as [string, number, 2, string]),
        ...Array.from({ length: 3 }, () => ['r1', 4, 2, 'short'] as [string, number, 2, string]),
        ...SCATTERED,
      ]),
    );
    expect(counted.diagnosis.recommended_action).toBe('Practice first putts from 5–10 ft');
    expect(counted.diagnosis.recommended_action).not.toMatch(/start line|pace/i);
  });

  it('S1: a hole whose strokes are spread thin has no path to count', () => {
    const mild = [
      { kind: 'tee_to_next', shotNumbers: [1], isPenalty: false, measuredContribution: -0.1, heuristicScore: null, baselineGap: null },
      { kind: 'approach_to_recovery', shotNumbers: [2], isPenalty: false, measuredContribution: -0.25, heuristicScore: null, baselineGap: null },
    ] as unknown as Parameters<typeof costlyPath>[0];
    expect(costlyPath(mild)).toBeNull();
    const fails = Array.from({ length: 12 }, (_, i): Occurrence => ({ round_id: `r${i % 4}`, hole_number: i, failed: true, pattern: costlyPath(mild), strokes: -1 }));
    expect(topPath(fails, 1)).toBeNull();
  });
});

describe('review fixes (#2221): ladder caps and windows', () => {
  it('S5: tee shots and opening holes stop at "likely"', () => {
    expect(sequenceTargetFor('sg_ott')?.maxState).toBe('inferred_hypothesis');
    expect(sequenceTargetFor('opening_hole_delta')?.maxState).toBe('inferred_hypothesis');
    expect(sequenceTargetFor('putts_made_5_10ft_pct')?.maxState).toBeUndefined();
    const target = sequenceTargetFor('sg_ott')!;
    const obs = {
      target,
      holesAttributed: 40,
      holesChecked: 40,
      universe: 30,
      failures: 12,
      failureRounds: 4,
      rollupStatus: 'supported',
      top: { pattern: 'driver missed right into the rough → approach missed the green', count: 6, rounds: 3, examples: [] },
      fieldCoverage: [{ field: 'miss_direction', have: 12, of: 12 }],
      meanStrokesPerFailure: -0.6,
      strokesSampleN: 12,
      observed: true,
      shortfalls: [],
    } as unknown as Parameters<typeof notTraced>[2];
    const nt = notTraced({ metric_label: 'SG: Off the Tee' }, target, obs, { loadFailed: false, noWindow: false });
    expect(nt.reason).toBe('pattern_only');
    expect(nt.sentence).toMatch(/^Not traced as a cause: ".+" repeats on 6 of 12 costly tee shots on par 4s and 5s across 3 rounds/);
  });

  it('S6: a 0-day span is no window, not [end, end]', () => {
    expect(scopeForEvidence('p1', { window_start: '', window_end: '2026-09-30', window_days: 0 })).toBeNull();
  });

  it('S6: a rolling 90-day generator is read over [today − 90, today], not around its last round', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    // What the rolling generators stamp: 90 days, no start, end = the newest round.
    const stamped = scopeForEvidence('p1', { window_start: '', window_end: '2026-08-01', window_days: 90 }, now);
    expect(stamped?.label).toBe('2026-05-03 to 2026-08-01');
    // What the base reads instead (BaseGenerator.rollingWindowDays = 90).
    const rolling = scopeForEvidence('p1', rollingWindowEvidence(90, now), now);
    expect(rolling?.label).toBe('2026-07-22 to 2026-10-20');
  });
});
