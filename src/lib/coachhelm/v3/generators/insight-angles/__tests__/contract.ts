/** Shared assertion: an angle row carries the Slice 5a read contract for its family. */
import { expect } from 'vitest';
import { buildCandidate } from '@/lib/coachhelm/v3/support/candidate';
import { ANGLE_FAMILIES, type AngleFamilyId, type AngleGapInput, type AngleTest } from '../angle-data';

export function expectFamilyContract(
  composed: { evidence: unknown },
  family: AngleFamilyId,
  expected: { roundsN: number; newestRoundId: string; insightType?: string },
): void {
  const def = ANGLE_FAMILIES[family];
  const ev = composed.evidence as Record<string, unknown> & {
    detail: Record<string, unknown>;
    comparison: { primary: { source: string; value: number }; lines: unknown[] };
    source_round_ids?: unknown;
    counterfactual?: { projected_score_if_closed?: number | null; suppressed?: boolean };
  };
  expect(ev.metric).toBe(def.metric);
  expect(ev.sample_unit).toBe(def.sample_unit);
  expect(ev.rounds_n).toBe(expected.roundsN);
  expect(ev.newest_round_id).toBe(expected.newestRoundId);
  // The rounds the row cites are the rounds it counted.
  expect(Array.isArray(ev.source_round_ids)).toBe(true);
  expect((ev.source_round_ids as string[]).length).toBe(ev.rounds_n);
  expect((ev.source_round_ids as string[])[0]).toBe(expected.newestRoundId);
  expect(ev.strokes_impact_method).toBe(def.impact);
  expect([def.benchmark, ...(def.benchmark_fallbacks ?? [])]).toContain(ev.comparison.primary.source);
  expect(ev.comparison.lines[0]).toEqual(ev.comparison.primary);
  expect(ev.detail.family).toBe(family);
  expect(ev.detail.ladder_cap).toBe(def.cap);
  expect(ev.detail.impact_kind).toBe(def.impact);
  expect(ev.detail.window_rule).toBe('newest_40_countable_rounds');
  // Every row carries its own gate statistic.
  const test = ev.detail.test as AngleTest | undefined;
  expect(test).toBeDefined();
  expect(test!.statistic).toBe('z');
  expect(test!.min_z).toBe(1.645);
  // The generator writes the family's insight type.
  if (expected.insightType !== undefined) expect(expected.insightType).toBe(def.insight_type);
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
  // A rough estimate is flagged as one and never carries a live projection,
  // so no reader can total it as a measured saving.
  if (def.impact === 'rough_estimate') {
    expect(ev.estimated).toBe(true);
    const cf = ev.counterfactual;
    expect(cf === undefined || cf.projected_score_if_closed == null).toBe(true);
  }
  // JSON round trip keeps every field (no Infinity / undefined numbers).
  expect(JSON.parse(JSON.stringify(gap))).toEqual(gap);
  // The Slice 1 support pass reads this row as its own family and tests it
  // on the weak side it claims (Slice 1c).
  const candidate = buildCandidate({ id: 'row', insight_type: def.insight_type, evidence: JSON.parse(JSON.stringify(ev)) });
  expect(candidate.family).toBe(family);
  expect(candidate.untestableReason).toBeNull();
  expect(candidate.gapInput).toEqual(gap);
  expect(candidate.direction).toBe('weakness');
  for (const arm of candidate.arms) expect(arm.have, arm.key).not.toBeNull();
}
