import { describe, it, expect } from 'vitest';
import {
  auditNumericClaims,
  collectScopedNumbers,
  type Measurement,
  type MeasurementSeries,
} from '@/lib/coachhelm/v3/chat/provenance';

/**
 * Audit row 47(b): the numeric audit used to accept a number that equalled ANY
 * measurement value from ANY tool in the turn — player-blind and metric-blind.
 * "Bob hits 58% of greens" passed whenever 58 was Alice's figure, and
 * "GIR 31.5%" passed whenever 31.5 was a putts-per-round value.
 *
 * These tests pin the binding: a number that only matches evidence about a
 * DIFFERENT player, or a DIFFERENT metric than the text names, is rejected —
 * while every honest shape (no cue, comparisons, deltas, detail numbers) still
 * passes, because 51% of turns already fail and false rejections are the
 * bigger production problem.
 */

const ALICE = { kind: 'player' as const, id: 'p-alice', label: 'Alice Moreno' };
const BOB = { kind: 'player' as const, id: 'p-bob', label: 'Bob Tran' };
const TEAM = { kind: 'team' as const, id: 't1', label: 'Ridge' };

const m = (over: Partial<Measurement>): Measurement => ({
  metric_id: 'gir_pct',
  metric_label: 'Greens in regulation',
  unit: 'percent',
  value: 58,
  entity: ALICE,
  window_start: '2026-06-01',
  window_end: '2026-07-20',
  sample_size: 9,
  sample_unit: 'rounds',
  as_of: '2026-07-20T12:00:00Z',
  coverage: 'complete',
  coverage_note: null,
  source: 'stats cache',
  method: 'gir_over_holes',
  denominator: null,
  benchmark: null,
  direction: 'higher_better',
  ...over,
});

const aliceGir = m({ value: 58 });
const bobGir = m({ value: 42, entity: BOB });
const alicePutts = m({ metric_id: 'putts_per_round', metric_label: 'Putts per round', unit: 'count', value: 31.5 });
const PLAYERS = [
  { id: ALICE.id, name: 'Alice Moreno', first_name: 'Alice', last_name: 'Moreno' },
  { id: BOB.id, name: 'Bob Tran', first_name: 'Bob', last_name: 'Tran' },
];

const audit = (text: string, measurements: Measurement[], extra: Parameters<typeof auditNumericClaims>[3] = [], series: MeasurementSeries[] = []) =>
  auditNumericClaims(text, measurements, series, extra, [], undefined, { players: PLAYERS });

describe('auditNumericClaims — player binding', () => {
  it("rejects Alice's number attributed to Bob", () => {
    const claims = audit('Bob hits 58% of greens in regulation.', [aliceGir, bobGir]);
    expect(claims.map((c) => c.text)).toEqual(['58']);
    expect(claims[0]?.misattributed).toBe(true);
  });

  it("accepts Alice's number attributed to Alice", () => {
    expect(audit('Alice hits 58% of greens in regulation.', [aliceGir, bobGir])).toEqual([]);
  });

  it('rejects a swapped pair inside one sentence', () => {
    const claims = audit('Alice is at 42%, Bob is at 58%.', [aliceGir, bobGir]);
    expect(claims.map((c) => c.text).sort()).toEqual(['42', '58']);
  });

  it('accepts a correct pair inside one sentence', () => {
    expect(audit('Alice is at 58%, Bob is at 42% GIR.', [aliceGir, bobGir])).toEqual([]);
    expect(audit('Alice and Bob sit at 58% and 42% respectively.', [aliceGir, bobGir])).toEqual([]);
  });

  it('matches a first name, a last name and a possessive', () => {
    expect(audit("Moreno's GIR is 58%.", [aliceGir, bobGir])).toEqual([]);
    expect(audit("Tran's GIR is 58%.", [aliceGir, bobGir]).map((c) => c.text)).toEqual(['58']);
  });

  it('carries the named player into a following pronoun sentence', () => {
    expect(audit('Alice leads the group. Her GIR is 58%.', [aliceGir, bobGir])).toEqual([]);
    expect(audit('Bob trails the group. His GIR is 58%.', [aliceGir, bobGir]).map((c) => c.text)).toEqual(['58']);
  });

  it('accepts an uncued number when no player is named', () => {
    expect(audit('The best mark is 58%.', [aliceGir, bobGir])).toEqual([]);
  });

  it('accepts a cross-player difference', () => {
    expect(audit("Alice's GIR is 16 points above Bob's.", [aliceGir, bobGir])).toEqual([]);
  });

  it('keeps a team figure valid next to a player only when the sentence says team', () => {
    const teamGir = m({ value: 51, entity: TEAM });
    expect(audit("Alice's GIR of 58% beats the team average of 51%.", [aliceGir, teamGir])).toEqual([]);
    expect(audit('Alice hits 51% of greens.', [aliceGir, teamGir]).map((c) => c.text)).toEqual(['51']);
  });

  it('binds detail numbers scoped by a player_id to that player', () => {
    const detail = {
      player: { player_id: BOB.id, name: 'Bob Tran' },
      rounds: [{ date: '2026-07-01', total_score: 77, total_putts: 33 }],
    };
    const extra = collectScopedNumbers(detail);
    expect(audit('Bob shot 77 on the day.', [aliceGir], extra)).toEqual([]);
    expect(audit('Alice shot 77 on the day.', [aliceGir], extra).map((c) => c.text)).toEqual(['77']);
  });

  it('leaves unscoped detail numbers supporting any player (e.g. insight prose)', () => {
    expect(audit('Bob made 4% from 15 to 25 feet.', [aliceGir], [4, 15, 25])).toEqual([]);
    expect(audit('Alice averages 73.4 in the insight.', [aliceGir], [73.4])).toEqual([]);
  });

  it('does nothing different when the turn names no roster player at all', () => {
    // Existing single-player tests use labels the text never names.
    expect(audit('58% of greens.', [aliceGir])).toEqual([]);
  });
});

describe('auditNumericClaims — metric binding', () => {
  it('rejects a putts value written as GIR', () => {
    const claims = audit('Her GIR is 31.5%.', [aliceGir, alicePutts]);
    expect(claims.map((c) => c.text)).toEqual(['31.5']);
    expect(claims[0]?.misattributed).toBe(true);
  });

  it('accepts the same value under its own metric', () => {
    expect(audit('She averages 31.5 putts per round.', [aliceGir, alicePutts])).toEqual([]);
  });

  it('binds each cue to its nearest number inside one clause', () => {
    expect(audit('GIR 58% / putts 31.5', [aliceGir, alicePutts])).toEqual([]);
    expect(audit('GIR 31.5 / putts 58', [aliceGir, alicePutts]).map((c) => c.text).sort()).toEqual(['31.5', '58']);
  });

  it('accepts an uncued number', () => {
    expect(audit('Her number to watch is 31.5.', [aliceGir, alicePutts])).toEqual([]);
  });

  it('does not treat bare "strokes" or "%" as a metric cue', () => {
    const sgPutting = m({ metric_id: 'sg_putting', metric_label: 'SG putting', unit: 'strokes', value: -0.84 });
    expect(audit('Putting cost her 0.84 strokes.', [sgPutting])).toEqual([]);
    expect(audit('She loses 0.84 strokes a round.', [sgPutting])).toEqual([]);
  });

  it('treats generic strokes gained as covering every area, but a named area must match', () => {
    const sgPutting = m({ metric_id: 'sg_putting', metric_label: 'SG putting', unit: 'strokes', value: -0.84 });
    const sgApproach = m({ metric_id: 'sg_approach', metric_label: 'SG approach', unit: 'strokes', value: 0.4 });
    expect(audit('Her strokes gained sits at -0.84.', [sgPutting, sgApproach])).toEqual([]);
    expect(audit('SG putting is -0.84.', [sgPutting, sgApproach])).toEqual([]);
    expect(audit('SG approach is -0.84.', [sgPutting, sgApproach]).map((c) => c.text)).toEqual(['-0.84']);
  });

  it('keeps a hedged number metric-consistent', () => {
    expect(audit('GIR of about 57%.', [aliceGir, alicePutts])).toEqual([]);
    expect(audit('GIR of about 32%.', [aliceGir, alicePutts]).map((c) => c.text)).toEqual(['32']);
  });

  it('keeps a same-metric pairwise difference and refuses a cross-metric one', () => {
    const aliceGirEarlier = m({ value: 74, window_start: '2026-04-01', window_end: '2026-05-31' });
    expect(audit('Her GIR fell 16 points to 58%.', [aliceGir, aliceGirEarlier])).toEqual([]);
    // 58 - 31.5 = 26.5 spans two metrics and is never an anchor.
    expect(audit('A 26.5 point gap.', [aliceGir, alicePutts]).map((c) => c.text)).toEqual(['26.5']);
  });

  it('binds a series delta and point to its own metric', () => {
    const series: MeasurementSeries = {
      metric_id: 'putts',
      metric_label: 'Putts',
      unit: 'count',
      entity: ALICE,
      points: [
        { at: '2026-07-01', value: 34, bucket: null, sample_size: 1 },
        { at: '2026-07-10', value: 29, bucket: null, sample_size: 1 },
      ],
      window_start: '2026-07-01',
      window_end: '2026-07-10',
      as_of: '2026-07-10T00:00:00Z',
      coverage: 'complete',
      coverage_note: null,
      source: 'rounds',
      method: 'per_round',
      benchmark: null,
      direction: 'lower_better',
    };
    expect(audit('Putts went from 34 to 29.', [aliceGir], [], [series])).toEqual([]);
    expect(audit('Her GIR is 34%.', [aliceGir], [], [series]).map((c) => c.text)).toEqual(['34']);
  });

  it('binds a detail number by its key', () => {
    const extra = collectScopedNumbers({ rounds: [{ total_score: 77, total_putts: 33 }] });
    expect(audit('She had 33 putts.', [aliceGir], extra)).toEqual([]);
    expect(audit('She had a GIR of 33%.', [aliceGir], extra).map((c) => c.text)).toEqual(['33']);
  });

  it('never binds sample sizes or denominators to a metric', () => {
    const rate = m({ metric_id: 'putt_make_pct_3_8ft', metric_label: 'Make rate 3-8 ft', value: 58, sample_size: 43, denominator: 43 });
    expect(audit('Her make rate is 58% on 43 putts.', [rate])).toEqual([]);
  });
});

describe('collectScopedNumbers', () => {
  it('tags a number with the nearest enclosing player_id and its key metric', () => {
    const out = collectScopedNumbers({
      team_name: 'Ridge',
      active_roster_count: 14,
      players: [{ player_id: 'p-a', name: 'A', last_round_to_par: 4, rounds_recorded: 20 }],
    });
    expect(out).toContainEqual({ value: 14, player_id: null, metric_key: 'active_roster_count' });
    expect(out).toContainEqual({ value: 4, player_id: 'p-a', metric_key: 'last_round_to_par' });
    expect(out).toContainEqual({ value: 20, player_id: 'p-a', metric_key: 'rounds_recorded' });
  });

  it('reads numbers out of tool prose without a metric key', () => {
    const out = collectScopedNumbers({ player: { player_id: 'p-a' }, insights: [{ content: 'making 4% from 15-25 ft' }] });
    expect(out).toContainEqual({ value: 4, player_id: 'p-a', metric_key: null });
  });
});
