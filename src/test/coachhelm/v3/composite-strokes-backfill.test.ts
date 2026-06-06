/**
 * SV-1 / tee-strat-1 / lag3putt-3: diagnostic strokes_impact backfill for the
 * composite synthesis path.
 *
 * Composite rules that don't compute their own leverage hard-code
 * `strokes_impact: 0` and never run through the generator-base counterfactual
 * backfill, so they rank LAST on flat surfaces under urgent-cascade titles. The
 * synthesis runner now backfills them from the MAX (not SUM) counterfactual-
 * derived strokes_impact of their source insights. These cover the two PURE
 * decisions the runner delegates to (the full run() path needs DB mocks).
 */
import { describe, it, expect } from 'vitest';
import {
  backfilledCompositeStrokesImpact,
  buildSourceImpactLookup,
} from '@/lib/coachhelm/v3/composite/synthesis';
import type { EvidenceInsight } from '@/lib/coachhelm/v3/composite/types';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

function srcInsight(id: string, strokesImpact: number | undefined): EvidenceInsight {
  return {
    id,
    insight_type: 'approach_miss',
    category: 'approach',
    signature: `v3:approach_miss:${id}`,
    player_id: 'p1',
    evidence: { strokes_impact: strokesImpact } as unknown as InsightEvidence,
    engine_version: 'v3',
    created_at: '2026-06-06T00:00:00Z',
  };
}

describe('buildSourceImpactLookup', () => {
  it('maps id → |strokes_impact| for finite values, skipping the rest', () => {
    const lookup = buildSourceImpactLookup([
      srcInsight('a', 1.2),
      srcInsight('b', -0.8), // abs → 0.8 (cascade costs strokes regardless of sign)
      srcInsight('c', undefined),
      srcInsight('d', NaN),
    ]);
    expect(lookup.get('a')).toBe(1.2);
    expect(lookup.get('b')).toBe(0.8);
    expect(lookup.has('c')).toBe(false);
    expect(lookup.has('d')).toBe(false);
  });
});

describe('backfilledCompositeStrokesImpact', () => {
  const lookup = new Map<string, number>([
    ['a', 0.6],
    ['b', 1.1],
    ['c', 0.3],
  ]);

  it('borrows the MAX source strokes_impact when the composite hard-codes 0', () => {
    expect(backfilledCompositeStrokesImpact(0, ['a', 'b', 'c'], lookup)).toBe(1.1);
  });

  it('uses MAX (not SUM) so leverage never inflates past a real counterfactual', () => {
    // SUM would be 2.0 — we must stay at the strongest single leak (1.1).
    expect(backfilledCompositeStrokesImpact(0, ['a', 'b'], lookup)).toBe(1.1);
  });

  it('keeps a rule-computed positive leverage untouched (front-9, doubles, etc.)', () => {
    expect(backfilledCompositeStrokesImpact(0.9, ['a', 'b'], lookup)).toBe(0.9);
  });

  it('returns the composed value when no source has a borrowable impact', () => {
    expect(backfilledCompositeStrokesImpact(0, ['z'], lookup)).toBe(0);
  });

  it('leaves ctx-driven composites (no source ids) unchanged', () => {
    expect(backfilledCompositeStrokesImpact(0, [], lookup)).toBe(0);
  });

  it('treats a non-finite composed value as needing backfill', () => {
    expect(backfilledCompositeStrokesImpact(NaN, ['a'], lookup)).toBe(0.6);
  });
});
