import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

import type { AngleData, AngleSequence, TourThreePutt } from '../angle-data';
import {
  ThreePuttChainGenerator,
  composeThreePuttChain,
  computeThreePuttChain,
  puttBandOf,
  resolveThreePuttBenchmark,
  teamThreePuttRate,
  toThreePuttAggregate,
  type ThreePuttBenchmark,
} from '../three-putt-chain';
import type { AngleHole, AngleShot } from '../angle-data';
import { expectFamilyContract } from './contract';
import { PLAYER, mkData, mkHole, mkRound, mkShot, mkTeam, stubLoaders } from './fixtures';

/**
 * `rounds` rounds of `holes` holes; every hole's first putt is `firstFt`, and
 * a hole 3-putts when `threePutt(roundIndex, hole)` says so (else 2 putts).
 */
function build(opts: {
  rounds?: number;
  holes?: 9 | 18;
  firstFt: (h: number, i: number) => number;
  threePutt: (i: number, h: number) => boolean;
  slope?: (h: number) => string | null;
  /** Second-putt distance on 3-putt holes (null = not recorded). Default 8. */
  leave?: (h: number, i: number) => number | null;
}): AngleData {
  const rounds = Array.from({ length: opts.rounds ?? 6 }, (_, i) => mkRound(i, { holes: opts.holes ?? 18 }));
  const holes: AngleHole[] = [];
  const shots: AngleShot[] = [];
  rounds.forEach((r, i) => {
    for (let h = 1; h <= (opts.holes ?? 18); h++) {
      const three = opts.threePutt(i, h);
      holes.push(mkHole(r.id, h, { putts: three ? 3 : 2, gir: true }));
      const base = { shot_type: 'putting', lie_before: 'green', club_type: 'putter', distance_to_hole_before: null, distance_to_hole_after: null };
      shots.push(mkShot(r.id, h, 3, { ...base, putt_distance_feet: opts.firstFt(h, i), putt_made: false, putt_slope: opts.slope ? opts.slope(h) : 'level' }));
      const leave = three ? (opts.leave ? opts.leave(h, i) : 8) : 2;
      shots.push(mkShot(r.id, h, 4, { ...base, putt_distance_feet: leave, putt_made: !three }));
      if (three) shots.push(mkShot(r.id, h, 5, { ...base, putt_distance_feet: 1, putt_made: true }));
    }
  });
  return mkData(rounds, holes, shots);
}

/** A synthetic Tour figure: 0.9 three-putts per 18 (0.05 a hole). */
const TOUR: TourThreePutt = { per_18: 0.9, tour: 'pga', season: '2025', source: 'synthetic test row' };
const BENCH: ThreePuttBenchmark = resolveThreePuttBenchmark(TOUR, null, PLAYER)!;

/** `count` teammates, 6 rounds of 18 holes each, `perRound` cached 3-putts a round. */
function team(count: number, perRound = 1): ReturnType<typeof mkTeam> {
  return mkTeam(count, 6, () => ({ three_putts: perRound }));
}

describe('putt bands', () => {
  it('split at 10, 20, 35 ft', () => {
    expect([9.9, 10, 19.9, 20, 34.9, 35].map(puttBandOf)).toEqual(['lt10', '10_20', '10_20', '20_35', '20_35', '35_plus']);
  });
});

describe('resolveThreePuttBenchmark (Q-88: Tour, else 5+ teammates, else nothing)', () => {
  it('uses the Tour figure when one is stored, as a per-hole rate', () => {
    expect(BENCH).toMatchObject({ source: 'tour', label: 'PGA Tour average', n: null });
    expect(BENCH.rate).toBeCloseTo(0.05, 6);
    expect(resolveThreePuttBenchmark({ ...TOUR, tour: 'lpga' }, null, PLAYER)!.label).toBe('LPGA Tour average');
  });

  it("falls back to the teammates' median at 5+ teammates and never counts the player", () => {
    const peers = [...team(4, 1), ...mkTeam(1, 6, () => ({ player_id: 'peer-x', three_putts: 3 }))];
    const own = mkTeam(1, 6, () => ({ player_id: PLAYER, three_putts: 9 }));
    const b = resolveThreePuttBenchmark(null, [...peers, ...own], PLAYER)!;
    expect(b.source).toBe('team_pool');
    expect(b.n).toBe(5);
    // Median of four teammates at 1/18 a hole and one at 3/18.
    expect(b.rate).toBeCloseTo(1 / 18, 6);
  });

  it('makes no comparison below 5 teammates (07 §6 privacy floor)', () => {
    expect(teamThreePuttRate(team(4), PLAYER)).toBeNull();
    expect(resolveThreePuttBenchmark(null, team(4), PLAYER)).toBeNull();
    expect(resolveThreePuttBenchmark(null, null, PLAYER)).toBeNull();
  });

  it('skips teammates without a cached 3-putt count or with fewer than 5 rounds', () => {
    expect(teamThreePuttRate(mkTeam(5, 6, () => ({ three_putts: null })), PLAYER)).toBeNull();
    expect(teamThreePuttRate(mkTeam(5, 4, () => ({ three_putts: 1 })), PLAYER)).toBeNull();
  });
});

describe('computeThreePuttChain', () => {
  it('returns null with no putts', () => {
    expect(computeThreePuttChain(mkData([mkRound(0)], [], []), BENCH)).toBeNull();
  });

  it('says nothing without a benchmark', () => {
    const r = computeThreePuttChain(build({ firstFt: (h) => 12 + (h % 6), threePutt: (_i, h) => h % 5 === 0 }), null)!;
    expect(r.qualifies).toBe(false);
    expect(r.benchmark_per_18).toBeNull();
    expect(toThreePuttAggregate(r, 74)).toBeNull();
  });

  it('classifies each 3-putt into one pathway: poor first-putt leave (second putt 6+ ft)', () => {
    // First putts 12-17 ft; 3-putt on 3 holes a round, second putt 8 ft.
    const r = computeThreePuttChain(build({ firstFt: (h) => 12 + (h % 6), threePutt: (_i, h) => h % 5 === 0 }), BENCH)!;
    expect(r.holes_putted).toBe(108);
    expect(r.three_putts).toBe(18);
    expect(r.qualifies).toBe(true);
    expect(r.cause).toBe('poor_first_putt_leave');
    expect(r.three_putts_per_18).toBe(3);
    // Non-overlapping: pathway counts + suppressed = all 3-putts.
    expect(r.pathways.reduce((a, p) => a + p.three_putts, 0) + r.pathway_suppressed).toBe(r.three_putts);
  });

  it('short follow-up miss when the second putt starts inside 6 ft', () => {
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0, leave: () => 4 }), BENCH)!;
    expect(r.cause).toBe('short_followup_miss');
    expect(r.pathways.find((p) => p.pathway === 'short_followup_miss')!.share_pct).toBe(100);
  });

  it('long approach leave for first putts of 35+ ft, even without a second-putt distance', () => {
    const r = computeThreePuttChain(build({ rounds: 8, firstFt: () => 40, threePutt: (i, h) => (i * 18 + h) % 13 < 4, leave: () => null }), BENCH)!;
    expect(r.cause).toBe('long_approach_leave');
    expect(r.pathway_suppressed).toBe(0);
  });

  it('suppresses a 3-putt from inside 35 ft with no recorded second putt — never invents a leave', () => {
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0, leave: (h) => (h === 5 ? null : 8) }), BENCH)!;
    expect(r.pathway_suppressed).toBe(6);
    expect(r.classified).toBe(12);
    const band = r.exposure.find((e) => e.band === '10_20')!;
    expect(band.leave_missing).toBe(6);
    expect(band.leave_recorded).toBe(band.first_putt_missed - 6);
    // Suppressed holes still count in the headline rate.
    expect(r.three_putts).toBe(18);
  });

  it('second-putt exposure buckets leaves by first-putt band', () => {
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0 }), BENCH)!;
    const band = r.exposure.find((e) => e.band === '10_20')!;
    // Every first putt misses (2 or 3 putts): 18 leaves of 8 ft, 90 of 2 ft.
    expect(band.first_putt_missed).toBe(108);
    expect(band.buckets).toEqual({ lt3: 90, '3_6': 0, '6_10': 18, '10_plus': 0 });
    expect(band.six_plus_pct).toBeCloseTo(16.7, 1);
    expect(r.exposure.find((e) => e.band === 'lt10')!.six_plus_pct).toBeNull();
  });

  it('excludes a hole whose putting rows are out of order or short of golf_holes.putts', () => {
    const data = build({ firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0 });
    // r0 hole 5: drop the second putt row (3 putts recorded, 2 rows, gap 3→5).
    data.shots = data.shots.filter((s) => !(s.round_id === 'r0' && s.hole_number === 5 && s.shot_number === 4));
    const r = computeThreePuttChain(data, BENCH)!;
    expect(r.excluded.putt_rows_incomplete).toBe(1);
    expect(r.holes_putted).toBe(107);
    expect(r.three_putts).toBe(17);
  });

  it('carries up to 5 example holes', () => {
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0 }), BENCH)!;
    expect(r.examples).toHaveLength(5);
    expect(r.examples[0]!.note).toContain('second putt 8 ft');
  });

  it('gates on putted holes (90) and 3-putt count', () => {
    const few = computeThreePuttChain(build({ rounds: 4, firstFt: () => 15, threePutt: (_i, h) => h % 3 === 0 }), BENCH)!;
    expect(few.holes_putted).toBe(72);
    expect(few.qualifies).toBe(false);
    const clean = computeThreePuttChain(build({ firstFt: () => 15, threePutt: () => false }), BENCH)!;
    expect(clean.qualifies).toBe(false);
  });

  it('scales to per 18 on 9-hole rounds', () => {
    const r = computeThreePuttChain(build({ rounds: 12, holes: 9, firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0 }), BENCH)!;
    // 1 three-putt per 9 holes → 2 per 18.
    expect(r.three_putts_per_18).toBe(2);
    expect(r.holes_per_18).toBe(18);
  });

  it('reports the slope split only when its own gate passes, with measured fill', () => {
    const r = computeThreePuttChain(
      build({ firstFt: () => 25, threePutt: (_i, h) => h % 4 === 0, slope: (h) => (h % 2 ? 'uphill' : 'downhill') }),
      BENCH,
    )!;
    expect(r.slope.lag_first_putts).toBe(108);
    expect(r.slope.fill_pct).toBe(100);
    expect(r.slope.qualifies).toBe(true);
    const unfilled = computeThreePuttChain(build({ firstFt: () => 25, threePutt: () => false, slope: () => null }), BENCH)!;
    expect(unfilled.slope.fill_pct).toBe(0);
    expect(unfilled.slope.qualifies).toBe(false);
  });
});

describe('composeThreePuttChain', () => {
  it('wires its own three_putts_per_18 metric against the Tour and sizes one stroke per avoided 3-putt', () => {
    const r = computeThreePuttChain(build({ firstFt: (h) => 12 + (h % 6), threePutt: (_i, h) => h % 5 === 0 }), BENCH)!;
    const c = composeThreePuttChain(toThreePuttAggregate(r, 74)!);
    const ev = c.evidence as typeof c.evidence & {
      counterfactual: { strokes_saved_per_round: number; attempts_used: number };
      comparison: { primary: unknown };
    };
    const gen = new ThreePuttChainGenerator(PLAYER, stubLoaders(mkData([], [], [])));
    expectFamilyContract(c, 'three_putt_chain', { roundsN: 6, newestRoundId: 'r5', insightType: gen.insightType });
    // Not composite C6's percent metric `three_putt_chain`.
    expect(ev.metric).toBe('three_putts_per_18');
    expect(ev.comparison_source).toBe('pga_baseline');
    expect(ev.comparison.primary).toMatchObject({ source: 'tour', label: 'PGA Tour average', value: 0.9 });
    expect(c.category).toBe('putting');
    expect(ev.counterfactual.attempts_used).toBe(18);
    // (18/108 − 0.05) × 18 = 2.1 strokes a round.
    expect(ev.counterfactual.strokes_saved_per_round).toBeCloseTo(2.1, 2);
    // 18 of 18 classified on one path: a majority, so "Most".
    expect(ev.diagnosis!.root_cause).toMatch(/^Most classified 3-putts \(18 of 18\)/);
    // 18 poor-leave 3-putts over 6 rounds clear the 02 §6 Observed floors. On
    // main the path is recorded in detail.sequence and the cause stays a
    // hypothesis until the root-cause slice (Slice 2) lifts it.
    expect(ev.diagnosis?.causality_level).toBe('inferred_hypothesis');
    expect((ev.detail as { sequence: AngleSequence }).sequence.meets_observed_floors).toBe(true);
    expect((ev.detail as { chain: string[] }).chain).toEqual(['approach', 'putting']);
    const receipts = (ev.detail as { receipts: { examples: unknown[]; samples: Record<string, number>; definition: string } }).receipts;
    expect(receipts.examples.length).toBeLessThanOrEqual(5);
    expect(receipts.samples.holes_putted).toBe(108);
    expect(receipts.definition).toContain('35+ ft');
    expect(c.content).toContain('Of 18 classified 3-putts');
  });

  it('files a length-led chain under approach', () => {
    const gen = new ThreePuttChainGenerator(PLAYER, stubLoaders(mkData([], [], [])));
    const r = computeThreePuttChain(build({ rounds: 8, firstFt: () => 40, threePutt: (i, h) => (i * 18 + h) % 13 < 4 }), BENCH)!;
    gen.composeContent(toThreePuttAggregate(r, 74)!);
    expect(gen.category).toBe('approach');
  });

  it('a 6/6/6 tie leads with no pathway: neutral title, putting category, no "most"', () => {
    // Per round: hole 5 from 40 ft, hole 10 leaves 8 ft, hole 15 leaves 4 ft.
    const r = computeThreePuttChain(
      build({
        firstFt: (h) => (h === 5 ? 40 : 15),
        threePutt: (_i, h) => h % 5 === 0,
        leave: (h) => (h === 10 ? 8 : 4),
      }),
      BENCH,
    )!;
    expect(r.pathways.map((p) => p.three_putts)).toEqual([6, 6, 6]);
    expect(r.pathway_tie).toBe(true);
    expect(r.cause).toBeNull();
    expect(r.sequence).toBeNull();
    const c = composeThreePuttChain(toThreePuttAggregate(r, 74)!);
    expect(c.title).toBe('3-putts above the PGA Tour average');
    expect(c.category).toBe('putting');
    expect(c.evidence.diagnosis!.root_cause).toMatch(/^No single pattern leads/);
    expect(`${c.title} ${c.content} ${c.evidence.diagnosis!.root_cause}`).not.toMatch(/\bMost\b/i);
  });

  it('a plurality under half reads "the most common pattern (x of y)", never "Most"', () => {
    // 18 three-putts: 5 long (hole 5, rounds 0-4), 5 short (hole 15, rounds 0-4), 8 poor leaves.
    const r = computeThreePuttChain(
      build({
        firstFt: (h, i) => (h === 5 && i < 5 ? 40 : 15),
        threePutt: (_i, h) => h % 5 === 0,
        leave: (h, i) => (h === 15 && i < 5 ? 4 : 8),
      }),
      BENCH,
    )!;
    expect(r.pathways.map((p) => [p.pathway, p.three_putts])).toEqual([
      ['long_approach_leave', 5],
      ['poor_first_putt_leave', 8],
      ['short_followup_miss', 5],
    ]);
    expect(r.cause).toBe('poor_first_putt_leave');
    const c = composeThreePuttChain(toThreePuttAggregate(r, 74)!);
    expect(c.evidence.diagnosis!.root_cause).toMatch(/^The most common pattern \(8 of 18\)/);
    expect(`${c.title} ${c.content}`).not.toMatch(/\bMost\b/);
    expect(c.evidence.diagnosis!.recommended_action).not.toMatch(/\bMost\b/);
    // The path clears the Observed floors (8 >= 4, 44% >= 30%, 6 rounds), so the title may lead with it.
    expect((c.evidence.detail as { sequence: AngleSequence }).sequence.meets_observed_floors).toBe(true);
    expect(c.title).toBe('First putts are leaving 6+ ft second putts');
  });

  it('keeps the neutral title when the leading path does not clear the Observed floors', () => {
    // Every 3-putt in 2 rounds: the path is under the 3-round floor.
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (i, h) => i < 2 && h % 2 === 0 }), BENCH)!;
    const c = composeThreePuttChain({
      result: { ...r, qualifies: true },
      baseline: 74,
      sampleN: r.holes_putted,
      playerValue: r.three_putts_per_18,
      windowRoundIds: r.round_ids,
    });
    expect((c.evidence.detail as { sequence: AngleSequence }).sequence.meets_observed_floors).toBe(false);
    expect(c.title).toBe('3-putts above the PGA Tour average');
  });

  it("compares with the teammates' median when no Tour figure is stored", () => {
    const bench = resolveThreePuttBenchmark(null, team(5, 1), PLAYER)!;
    const r = computeThreePuttChain(build({ firstFt: (h) => 12 + (h % 6), threePutt: (_i, h) => h % 5 === 0 }), bench)!;
    const c = composeThreePuttChain(toThreePuttAggregate(r, 74)!);
    expectFamilyContract(c, 'three_putt_chain', { roundsN: 6, newestRoundId: 'r5' });
    expect(c.evidence.comparison_source).toBe('team_avg');
    const primary = (c.evidence as unknown as { comparison: { primary: unknown } }).comparison.primary;
    expect(primary).toMatchObject({ source: 'team_pool', n: 5 });
  });
});

describe('ThreePuttChainGenerator.aggregate (injected loaders)', () => {
  const data = build({ firstFt: (h) => 12 + (h % 6), threePutt: (_i, h) => h % 5 === 0 });

  it('uses the Tour figure and never reads the team', async () => {
    const loaders = stubLoaders(data, { tour: TOUR, team: team(5) });
    const agg = await new ThreePuttChainGenerator(PLAYER, loaders).aggregate();
    expect(agg!.result.benchmark!.source).toBe('tour');
    expect(loaders.calls.teamRounds).toBe(0);
  });

  it('falls back to 5+ teammates, and says nothing with 4', async () => {
    const five = await new ThreePuttChainGenerator(PLAYER, stubLoaders(data, { team: team(5) })).aggregate();
    expect(five!.result.benchmark!.source).toBe('team_pool');
    const four = await new ThreePuttChainGenerator(PLAYER, stubLoaders(data, { team: team(4) })).aggregate();
    expect(four).toBeNull();
  });
});

describe('counted sequence (detail.sequence)', () => {
  it('records the dominant pathway, counts and example holes in putt order, and clears the Observed floors', () => {
    const r = computeThreePuttChain(build({ firstFt: (h) => 12 + (h % 6), threePutt: (_i, h) => h % 5 === 0 }), BENCH)!;
    expect(r.sequence).toMatchObject({ pathway: 'poor_first_putt_leave', occurrences: 18, of: 18, distinct_rounds: 6 });
    const c = composeThreePuttChain(toThreePuttAggregate(r, 74)!);
    const seq = (c.evidence.detail as { sequence: AngleSequence }).sequence;
    expect(seq).toMatchObject({ occurrences: 18, of: 18, distinct_rounds: 6, population: 'classified 3-putts' });
    expect(seq.pattern).toContain('second putt from 6+ ft');
    expect(seq.examples.length).toBeGreaterThan(0);
    expect(seq.examples.length).toBeLessThanOrEqual(5);
    expect(seq.meets_observed_floors).toBe(true);
    // No basis claim on main: the cause stays a hypothesis (Slice 2 lifts it).
    expect(c.evidence.diagnosis!.causality_level).toBe('inferred_hypothesis');
  });

  it('stays inferred when the pathway is below the shared floors (too few rounds)', () => {
    // 2 rounds of 3-putts only: 18 holes a round → pathway over < 3 rounds.
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (i, h) => i < 2 && h % 2 === 0 }), BENCH)!;
    expect(r.sequence!.distinct_rounds).toBe(2);
    const c = composeThreePuttChain({
      result: { ...r, qualifies: true },
      baseline: 74,
      sampleN: r.holes_putted,
      playerValue: r.three_putts_per_18,
      windowRoundIds: r.round_ids,
    });
    expect(c.evidence.diagnosis!.causality_level).toBe('inferred_hypothesis');
    expect((c.evidence.detail as { sequence: AngleSequence }).sequence.meets_observed_floors).toBe(false);
  });
});
