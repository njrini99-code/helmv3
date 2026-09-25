import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

import { hasGeneratorSequenceEvidence } from '@/lib/coachhelm/v3/engine/generator-base';
import {
  PEER_THREE_PUTT,
  PUTT_BANDS,
  ThreePuttChainGenerator,
  composeThreePuttChain,
  computeThreePuttChain,
  puttBandOf,
  toThreePuttAggregate,
} from '../three-putt-chain';
import type { AngleHole, AngleShot } from '../angle-data';
import { PLAYER, mkData, mkHole, mkRound, mkShot } from './fixtures';

/**
 * `rounds` rounds of `holes` holes; every hole's first putt is `firstFt`, and
 * a hole 3-putts when `threePutt(roundIndex, hole)` says so (else 2 putts).
 */
function build(opts: {
  rounds?: number;
  holes?: 9 | 18;
  firstFt: (h: number) => number;
  threePutt: (i: number, h: number) => boolean;
  slope?: (h: number) => string | null;
  /** Second-putt distance on 3-putt holes (null = not recorded). Default 8. */
  leave?: (h: number) => number | null;
}) {
  const rounds = Array.from({ length: opts.rounds ?? 6 }, (_, i) => mkRound(i, { holes: opts.holes ?? 18 }));
  const holes: AngleHole[] = [];
  const shots: AngleShot[] = [];
  rounds.forEach((r, i) => {
    for (let h = 1; h <= (opts.holes ?? 18); h++) {
      const three = opts.threePutt(i, h);
      holes.push(mkHole(r.id, h, { putts: three ? 3 : 2, gir: true }));
      const base = { shot_type: 'putting', lie_before: 'green', club_type: 'putter', distance_to_hole_before: null, distance_to_hole_after: null };
      shots.push(mkShot(r.id, h, 3, { ...base, putt_distance_feet: opts.firstFt(h), putt_made: false, putt_slope: opts.slope ? opts.slope(h) : 'level' }));
      const leave = three ? (opts.leave ? opts.leave(h) : 8) : 2;
      shots.push(mkShot(r.id, h, 4, { ...base, putt_distance_feet: leave, putt_made: !three }));
      if (three) shots.push(mkShot(r.id, h, 5, { ...base, putt_distance_feet: 1, putt_made: true }));
    }
  });
  return mkData(rounds, holes, shots);
}

const peerRate = PUTT_BANDS.reduce((a, b) => a + PEER_THREE_PUTT[b].share * PEER_THREE_PUTT[b].rate, 0);

describe('PEER_THREE_PUTT', () => {
  it('shares sum to 1', () => {
    expect(PUTT_BANDS.reduce((a, b) => a + PEER_THREE_PUTT[b].share, 0)).toBeCloseTo(1, 2);
  });
  it('bands split at 10, 20, 35 ft', () => {
    expect([9.9, 10, 19.9, 20, 34.9, 35].map(puttBandOf)).toEqual(['lt10', '10_20', '10_20', '20_35', '20_35', '35_plus']);
  });
});

describe('computeThreePuttChain', () => {
  it('returns null with no putts', () => {
    expect(computeThreePuttChain(mkData([mkRound(0)], [], []))).toBeNull();
  });

  it('classifies each 3-putt into one pathway: poor first-putt leave (second putt 6+ ft)', () => {
    // First putts 12-17 ft; 3-putt on 3 holes a round, second putt 8 ft.
    const r = computeThreePuttChain(build({ firstFt: (h) => 12 + (h % 6), threePutt: (_i, h) => h % 5 === 0 }))!;
    expect(r.holes_putted).toBe(108);
    expect(r.three_putts).toBe(18);
    expect(r.qualifies).toBe(true);
    expect(r.cause).toBe('poor_first_putt_leave');
    expect(r.three_putts_per_18).toBe(3);
    // Non-overlapping: pathway counts + suppressed = all 3-putts.
    expect(r.pathways.reduce((a, p) => a + p.three_putts, 0) + r.pathway_suppressed).toBe(r.three_putts);
  });

  it('short follow-up miss when the second putt starts inside 6 ft', () => {
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0, leave: () => 4 }))!;
    expect(r.cause).toBe('short_followup_miss');
    expect(r.pathways.find((p) => p.pathway === 'short_followup_miss')!.share_pct).toBe(100);
  });

  it('long approach leave for first putts of 35+ ft, even without a second-putt distance', () => {
    const r = computeThreePuttChain(build({ rounds: 8, firstFt: () => 40, threePutt: (i, h) => (i * 18 + h) % 13 < 4, leave: () => null }))!;
    expect(r.cause).toBe('long_approach_leave');
    expect(r.pathway_suppressed).toBe(0);
  });

  it('suppresses a 3-putt from inside 35 ft with no recorded second putt — never invents a leave', () => {
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0, leave: (h) => (h === 5 ? null : 8) }))!;
    expect(r.pathway_suppressed).toBe(6);
    expect(r.classified).toBe(12);
    const band = r.exposure.find((e) => e.band === '10_20')!;
    expect(band.leave_missing).toBe(6);
    expect(band.leave_recorded).toBe(band.first_putt_missed - 6);
    // Suppressed holes still count in the headline rate.
    expect(r.three_putts).toBe(18);
  });

  it('second-putt exposure buckets leaves by first-putt band', () => {
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0 }))!;
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
    const r = computeThreePuttChain(data)!;
    expect(r.excluded.putt_rows_incomplete).toBe(1);
    expect(r.holes_putted).toBe(107);
    expect(r.three_putts).toBe(17);
  });

  it('carries up to 5 example holes', () => {
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0 }))!;
    expect(r.examples).toHaveLength(5);
    expect(r.examples[0]!.note).toContain('second putt 8 ft');
  });

  it('gates on putted holes (90) and 3-putt count', () => {
    const few = computeThreePuttChain(build({ rounds: 4, firstFt: () => 15, threePutt: (_i, h) => h % 3 === 0 }))!;
    expect(few.holes_putted).toBe(72);
    expect(few.qualifies).toBe(false);
    const clean = computeThreePuttChain(build({ firstFt: () => 15, threePutt: () => false }))!;
    expect(clean.qualifies).toBe(false);
  });

  it('scales to per 18 on 9-hole rounds', () => {
    const r = computeThreePuttChain(build({ rounds: 12, holes: 9, firstFt: () => 15, threePutt: (_i, h) => h % 5 === 0 }))!;
    // 1 three-putt per 9 holes → 2 per 18.
    expect(r.three_putts_per_18).toBe(2);
    expect(r.holes_per_18).toBe(18);
  });

  it('reports the slope split only when its own gate passes, with measured fill', () => {
    const r = computeThreePuttChain(
      build({ firstFt: () => 25, threePutt: (_i, h) => h % 4 === 0, slope: (h) => (h % 2 ? 'uphill' : 'downhill') }),
    )!;
    expect(r.slope.lag_first_putts).toBe(108);
    expect(r.slope.fill_pct).toBe(100);
    expect(r.slope.qualifies).toBe(true);
    const unfilled = computeThreePuttChain(build({ firstFt: () => 25, threePutt: () => false, slope: () => null }))!;
    expect(unfilled.slope.fill_pct).toBe(0);
    expect(unfilled.slope.qualifies).toBe(false);
  });
});

describe('composeThreePuttChain', () => {
  it('wires the three_putt_chain metric and sizes one stroke per avoided 3-putt', () => {
    const r = computeThreePuttChain(build({ firstFt: (h) => 12 + (h % 6), threePutt: (_i, h) => h % 5 === 0 }))!;
    const c = composeThreePuttChain(toThreePuttAggregate(r, 74)!);
    const ev = c.evidence as typeof c.evidence & { counterfactual: { strokes_saved_per_round: number; attempts_used: number } };
    expect(ev.metric).toBe('three_putt_chain');
    expect(ev.comparison_source).toBe('estimated_target');
    expect(c.category).toBe('putting');
    expect(ev.counterfactual.attempts_used).toBe(18);
    expect(ev.counterfactual.strokes_saved_per_round).toBeCloseTo((18 / 108 - peerRate) * 18, 1);
    // 18 poor-leave 3-putts over 6 rounds clear the shared floors: observed, with its sequence basis.
    expect(ev.diagnosis?.causality_level).toBe('observed_sequence');
    expect((ev.detail as { chain: string[] }).chain).toEqual(['approach', 'putting']);
    const receipts = (ev.detail as { receipts: { examples: unknown[]; samples: Record<string, number>; definition: string } }).receipts;
    expect(receipts.examples.length).toBeLessThanOrEqual(5);
    expect(receipts.samples.holes_putted).toBe(108);
    expect(receipts.definition).toContain('35+ ft');
    expect(c.content).toContain('Of 18 classified 3-putts');
  });

  it('files a length-led chain under approach', () => {
    const gen = new ThreePuttChainGenerator(PLAYER);
    const r = computeThreePuttChain(build({ rounds: 8, firstFt: () => 40, threePutt: (i, h) => (i * 18 + h) % 13 < 4 }))!;
    gen.composeContent(toThreePuttAggregate(r, 74)!);
    expect(gen.category).toBe('approach');
  });
});

describe('observed sequence claim', () => {
  it('claims observed_sequence with the dominant pathway, counts and example holes in putt order', () => {
    const r = computeThreePuttChain(build({ firstFt: (h) => 12 + (h % 6), threePutt: (_i, h) => h % 5 === 0 }))!;
    expect(r.sequence).toMatchObject({ pathway: 'poor_first_putt_leave', occurrences: 18, of: 18, distinct_rounds: 6 });
    const c = composeThreePuttChain(toThreePuttAggregate(r, 74)!);
    const d = c.evidence.diagnosis!;
    expect(d.causality_level).toBe('observed_sequence');
    expect(d.basis?.kind).toBe('shot_sequence');
    expect(d.basis?.sequence?.examples?.length).toBeGreaterThan(0);
    expect(d.basis?.sequence?.examples?.length).toBeLessThanOrEqual(5);
    expect(hasGeneratorSequenceEvidence(d)).toBe(true);
  });

  it('stays inferred when the pathway is below the shared floors (too few rounds)', () => {
    // 2 rounds of 3-putts only: 18 holes a round → pathway over < 3 rounds.
    const r = computeThreePuttChain(build({ firstFt: () => 15, threePutt: (i, h) => i < 2 && h % 2 === 0 }))!;
    expect(r.sequence!.distinct_rounds).toBe(2);
    const c = composeThreePuttChain({ result: { ...r, qualifies: true }, baseline: 74, sampleN: r.holes_putted, playerValue: r.three_putts_per_18 });
    expect(c.evidence.diagnosis!.causality_level).toBe('inferred_hypothesis');
  });
});
