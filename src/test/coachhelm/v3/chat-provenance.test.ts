import { describe, it, expect } from 'vitest';
import {
  auditNumericClaims,
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
