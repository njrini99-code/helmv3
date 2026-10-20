/** Shared assertion: an angle row carries the Slice 5a read contract for its family. */
import { expect } from 'vitest';
import { ANGLE_FAMILIES, type AngleFamilyId, type AngleGapInput } from '../angle-data';

export function expectFamilyContract(
  composed: { evidence: unknown },
  family: AngleFamilyId,
  expected: { roundsN: number; newestRoundId: string },
): void {
  const def = ANGLE_FAMILIES[family];
  const ev = composed.evidence as Record<string, unknown> & {
    detail: Record<string, unknown>;
    comparison: { primary: { source: string; value: number }; lines: unknown[] };
  };
  expect(ev.metric).toBe(def.metric);
  expect(ev.sample_unit).toBe(def.sample_unit);
  expect(ev.rounds_n).toBe(expected.roundsN);
  expect(ev.newest_round_id).toBe(expected.newestRoundId);
  expect(ev.strokes_impact_method).toBe(def.impact);
  expect(ev.comparison.primary.source).toBe(def.benchmark);
  expect(ev.comparison.lines[0]).toEqual(ev.comparison.primary);
  expect(ev.detail.family).toBe(family);
  expect(ev.detail.ladder_cap).toBe(def.cap);
  expect(ev.detail.impact_kind).toBe(def.impact);
  expect(ev.detail.window_rule).toBe('newest_40_countable_rounds');
  const gap = ev.detail.gap_input as AngleGapInput;
  expect(gap.kind).toBe(def.gap_kind);
  if (gap.kind === 'mean') {
    expect(gap.se).toBeGreaterThan(0);
    expect(Number.isFinite(gap.df)).toBe(true);
  } else {
    expect(gap.benchmark).toBeGreaterThan(0);
    expect(gap.benchmark).toBeLessThan(1);
    expect(gap.k).toBeLessThanOrEqual(gap.n);
  }
  // A rough estimate is flagged as one and never reads as a measured saving.
  if (def.impact === 'rough_estimate') {
    expect(ev.estimated).toBe(true);
  }
  // JSON round trip keeps every field (no Infinity / undefined numbers).
  expect(JSON.parse(JSON.stringify(gap))).toEqual(gap);
}
