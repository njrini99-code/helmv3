import { describe, it, expect } from 'vitest';
import {
  auditNumericClaims,
  collectNumbers,
  coverageFor,
  unavailableEnvelope,
  type Measurement,
  type MeasurementSeries,
} from '@/lib/coachhelm/v3/chat/provenance';

const measurement = (over: Partial<Measurement> = {}): Measurement => ({
  metric_id: 'putt_make_pct_3_8ft',
  metric_label: 'Make rate inside 8 feet',
  unit: 'percent',
  value: 58,
  entity: { kind: 'player', id: 'p1', label: 'Nick' },
  window_start: '2026-06-01',
  window_end: '2026-07-20',
  sample_size: 43,
  sample_unit: 'attempts',
  as_of: '2026-07-20T12:00:00Z',
  coverage: 'complete',
  coverage_note: null,
  source: 'stats cache',
  method: 'putts_made_over_attempts',
  denominator: 43,
  benchmark: null,
  direction: 'higher_better',
  ...over,
});

/**
 * The grounding check this replaces asked only "did a tool run?", which a
 * fabricated number passes trivially. These tests pin the behaviour that
 * actually matters: a figure with no measurement behind it is caught.
 */
describe('auditNumericClaims', () => {
  it('catches the invented before-and-after that motivated this check', () => {
    // Tools returned 58% over 43 attempts. The model wrote a 71% that never
    // existed — the single most common failure mode for this kind of surface.
    const claims = auditNumericClaims(
      'His make rate fell from 71% to 58% across 43 attempts.',
      [measurement()],
    );
    expect(claims.map((c) => c.text)).toEqual(['71']);
  });

  it('accepts every figure a tool actually produced', () => {
    expect(
      auditNumericClaims('58% over 43 attempts.', [measurement()]),
    ).toEqual([]);
  });

  it('accepts sensible rounding rather than punishing it', () => {
    // A check that fires on 58 vs 58.3 is a check that gets switched off.
    expect(auditNumericClaims('about 58%', [measurement({ value: 58.3 })])).toEqual([]);
  });

  it('accepts a stated delta between two points of a series', () => {
    const series: MeasurementSeries = {
      metric_id: 'sg_putting',
      metric_label: 'Strokes gained putting',
      unit: 'strokes',
      entity: { kind: 'player', id: 'p1', label: 'Nick' },
      points: [
        { at: '2026-07-01', value: 71, bucket: null, sample_size: 1 },
        { at: '2026-07-10', value: 58, bucket: null, sample_size: 1 },
      ],
      window_start: '2026-07-01',
      window_end: '2026-07-10',
      as_of: '2026-07-20T12:00:00Z',
      coverage: 'complete',
      coverage_note: null,
      source: 'rounds',
      method: 'round_level',
      benchmark: null,
      direction: 'higher_better',
    };
    // 71 → 58 is a drop of 13, and saying so is supported by the series.
    expect(auditNumericClaims('down 13 from 71 to 58', [], [series])).toEqual([]);
  });

  it('ignores dates, times and small counts', () => {
    const text =
      'Over his last 5 rounds, on 2026-07-14 at 3:00 PM, across 3 events with 8 players.';
    expect(auditNumericClaims(text, [measurement()])).toEqual([]);
  });

  it('accepts figures a tool returned in its structured detail', () => {
    // Found in live verification: the weakest-area tool returns each metric's
    // team average in `detail.gaps`, the model correctly cited it, and the
    // audit flagged five sourced numbers as fabricated because only
    // `measurements` was checked. A check that cries wolf gets switched off.
    const detail = { gaps: [{ team_average: -0.09, player_value: -0.45 }], recorded_rounds: 12 };
    const claims = auditNumericClaims(
      'His gap is -0.45 against a team average of -0.09 over 12 rounds.',
      [measurement({ metric_id: 'sg_around_green', unit: 'strokes', value: -0.45 })],
      [],
      collectNumbers(detail),
    );
    expect(claims).toEqual([]);
  });

  it('still catches a fabrication when detail is present', () => {
    const detail = { gaps: [{ team_average: -0.09 }] };
    const claims = auditNumericClaims(
      'A team average of -0.09, and his make rate is 71%.',
      [measurement({ value: 58 })],
      [],
      collectNumbers(detail),
    );
    expect(claims.map((c) => c.value)).toEqual([71]);
  });

  it('accepts a gap between two players on the same metric', () => {
    // Verification, two-player putting comparison: the tools returned each
    // player's five-round mean, the model subtracted them, and the audit called
    // the difference a fabrication. Comparing is the whole point of the
    // question, and no tool can pre-compute every pair a coach might ask for.
    const rivers = measurement({
      metric_id: 'sg_putting_mean',
      unit: 'strokes',
      value: -3.45,
      entity: { kind: 'player', id: 'p1', label: 'Mason Rivers' },
    });
    const bennett = measurement({
      metric_id: 'sg_putting_mean',
      unit: 'strokes',
      value: -5.86,
      entity: { kind: 'player', id: 'p2', label: 'Cole Bennett' },
    });
    const claims = auditNumericClaims(
      "Bennett's deficit is roughly 2.4 strokes per round larger than Rivers's.",
      [rivers, bennett],
    );
    expect(claims).toEqual([]);
  });

  it('will not justify a figure by subtracting two unrelated metrics', () => {
    // 34 putts minus 2.4 strokes gained is not a quantity. Grouping deltas by
    // metric is what stops the pairwise allowance becoming a blank cheque.
    const putts = measurement({ metric_id: 'putts_per_round', unit: 'count', value: 34 });
    const sg = measurement({ metric_id: 'sg_putting_mean', unit: 'strokes', value: 2.4 });
    const claims = auditNumericClaims('He gave up 31.6 shots on the greens.', [putts, sg]);
    expect(claims.map((c) => c.value)).toEqual([31.6]);
  });

  it('accepts a magnitude written without its sign', () => {
    // "lost 7.61 strokes" and "-7.61 strokes" are the same statement.
    const m = measurement({ metric_id: 'sg_putting', unit: 'strokes', value: -7.61 });
    expect(auditNumericClaims('He lost 7.61 strokes putting.', [m])).toEqual([]);
  });

  it('accepts a hedged bound rounded outward from a real value', () => {
    // "more than 7.5" against a measured -7.61 is careful writing, not invention.
    const m = measurement({ metric_id: 'sg_putting', unit: 'strokes', value: -7.61 });
    expect(auditNumericClaims('Two rounds where he lost more than 7.5 strokes.', [m])).toEqual([]);
  });

  it('still catches invention even when it is hedged', () => {
    // A hedge widens the tolerance by a tenth; it does not license a number
    // that no measurement is anywhere near.
    const claims = auditNumericClaims('His make rate is roughly 71%.', [measurement({ value: 58 })]);
    expect(claims.map((c) => c.value)).toEqual([71]);
  });

  it('flags an invented benchmark', () => {
    // No benchmark was retrieved, so no Tour figure can be supported.
    const claims = auditNumericClaims(
      'The PGA Tour average inside eight feet is 88%.',
      [measurement()],
    );
    expect(claims.map((c) => c.value)).toContain(88);
  });

  it('accepts a benchmark that WAS retrieved, with its source', () => {
    const withBenchmark = measurement({
      benchmark: {
        source: 'PGA Tour expected strokes (Broadie / ShotLink)',
        version: '2026-06-06 calibration',
        value: 88,
        omitted_for_cohort: false,
      },
    });
    expect(auditNumericClaims('Tour reference is 88%.', [withBenchmark])).toEqual([]);
  });
});

/**
 * The coverage helper is the fix for the seven-players-reported-as-six bug:
 * `partial` and `empty` must stay distinct, and neither may round to complete.
 */
describe('coverageFor', () => {
  it('reports a shortfall as partial, never as complete', () => {
    expect(coverageFor(6, 7)).toBe('partial');
  });

  it('distinguishes "found nobody" from "found some"', () => {
    expect(coverageFor(0, 7)).toBe('empty');
    expect(coverageFor(1, 7)).toBe('partial');
  });

  it('is complete only when everything was found', () => {
    expect(coverageFor(7, 7)).toBe('complete');
  });

  it('treats an empty scope as empty rather than complete', () => {
    expect(coverageFor(0, 0)).toBe('empty');
  });
});

describe('unavailableEnvelope', () => {
  it('never reads as "no data" — a failed read is a different statement', () => {
    const envelope = unavailableEnvelope('Could not read rounds.', 'The query failed.');
    expect(envelope.coverage).toBe('unavailable');
    expect(envelope.coverage).not.toBe('empty');
    expect(envelope.measurements).toEqual([]);
  });
});

describe('collectNumbers', () => {
  it('walks nested tool payloads', () => {
    const found = collectNumbers({ a: 1.5, b: [{ c: 2 }, { d: [3, 4] }], e: 'no', f: null });
    expect(found.sort((x, y) => x - y)).toEqual([1.5, 2, 3, 4]);
  });

  it('is depth-bounded so a pathological payload cannot spin', () => {
    // Build a structure deeper than the bound and assert it terminates.
    let deep: unknown = 42;
    for (let i = 0; i < 40; i += 1) deep = { next: deep };
    expect(collectNumbers(deep)).toEqual([]);
  });

  it('ignores non-finite values', () => {
    expect(collectNumbers({ a: NaN, b: Infinity, c: 7 })).toEqual([7]);
  });
});
