/**
 * PrescribedPracticePlanCard — `derivePracticePlan` pure-derivation tests.
 *
 * Covers the stale-list fix's supporting contract: insight-priority
 * ordering, area dedupe (via `focusAreas`), the `extraUsedAreas` exclusion
 * that lets the card pin session-saved drills without a prop refresh, and
 * the 3-drill cap.
 */
import { describe, it, expect } from 'vitest';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { derivePracticePlan } from './PrescribedPracticePlanCard';

// ---------------------------------------------------------------------------
// Fixtures — mirrors src/test/golf/components/InsightCard.test.tsx
// ---------------------------------------------------------------------------

function makeEvidence(overrides: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'putt_make_rate_6_10ft',
    metric_label: '6-10 ft make rate',
    unit: 'percent',
    your_value: 0.38,
    your_value_display: '38%',
    comparison_value: 0.52,
    comparison_label: 'D2 average',
    comparison_source: 'd2_avg',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-03-23T00:00:00.000Z',
    window_end: '2026-04-22T00:00:00.000Z',
    strokes_impact: 2.1,
    strokes_impact_method: 'peer_delta',
    confidence: 0.78,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
    ...overrides,
  };
}

function makeInsight(overrides: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id: 'insight-1',
    player_id: 'player-1',
    category: 'putting',
    title: 'Needs work on 6-10ft putts',
    content: 'Making 38% of putts from 6-10 ft, below the D2 average.',
    signature: 'putt_make_rate_6_10ft',
    evidence: makeEvidence(),
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
    drills: [],
    ...overrides,
  };
}

const ZERO_BREAKDOWN = { teeGame: 100, approach: 100, shortGame: 100, putting: 100, scoring: 100 };

describe('derivePracticePlan — insight-priority ordering', () => {
  it('ranks urgent > high > medium > low regardless of input order', () => {
    const drills = derivePracticePlan({
      insights: [
        makeInsight({ id: 'a', category: 'putting', priority: 'low' }),
        makeInsight({ id: 'b', category: 'approach', priority: 'urgent' }),
        makeInsight({ id: 'c', category: 'short_game', priority: 'medium' }),
        makeInsight({ id: 'd', category: 'tee', priority: 'high' }),
      ],
      patterns: [],
      categoryBreakdown: ZERO_BREAKDOWN,
      focusAreas: [],
    });
    expect(drills.map((d) => d.sourceInsightId)).toEqual(['b', 'd', 'c']);
  });
});

describe('derivePracticePlan — area dedupe', () => {
  it('skips an insight whose area_type is already present in focusAreas', () => {
    const drills = derivePracticePlan({
      insights: [
        makeInsight({ id: 'a', category: 'putting', priority: 'urgent' }),
        makeInsight({ id: 'b', category: 'approach', priority: 'high' }),
      ],
      patterns: [],
      categoryBreakdown: ZERO_BREAKDOWN,
      focusAreas: [{ id: 'fa-1', title: 'Putting focus', area_type: 'putting' }],
    });
    expect(drills.map((d) => d.sourceInsightId)).toEqual(['b']);
  });

  it('only takes the first insight per area_type, even across many candidates', () => {
    const drills = derivePracticePlan({
      insights: [
        makeInsight({ id: 'a', category: 'putting', priority: 'urgent' }),
        makeInsight({ id: 'b', category: 'putting', priority: 'high' }),
      ],
      patterns: [],
      categoryBreakdown: ZERO_BREAKDOWN,
      focusAreas: [],
    });
    expect(drills.map((d) => d.sourceInsightId)).toEqual(['a']);
  });
});

describe('derivePracticePlan — extraUsedAreas exclusion', () => {
  it('excludes an area covered by extraUsedAreas even when focusAreas is stale (empty)', () => {
    const drills = derivePracticePlan({
      insights: [
        makeInsight({ id: 'a', category: 'putting', priority: 'urgent' }),
        makeInsight({ id: 'b', category: 'approach', priority: 'high' }),
      ],
      patterns: [],
      categoryBreakdown: ZERO_BREAKDOWN,
      focusAreas: [], // stale — doesn't know about the just-saved 'putting' area yet
      extraUsedAreas: ['putting'],
    });
    expect(drills.map((d) => d.sourceInsightId)).toEqual(['b']);
  });

  it('combines with focusAreas rather than replacing it', () => {
    const drills = derivePracticePlan({
      insights: [
        makeInsight({ id: 'a', category: 'putting', priority: 'urgent' }),
        makeInsight({ id: 'b', category: 'approach', priority: 'high' }),
        makeInsight({ id: 'c', category: 'short_game', priority: 'medium' }),
      ],
      patterns: [],
      categoryBreakdown: ZERO_BREAKDOWN,
      focusAreas: [{ id: 'fa-1', title: 'Approach focus', area_type: 'approach' }],
      extraUsedAreas: ['putting'],
    });
    expect(drills.map((d) => d.sourceInsightId)).toEqual(['c']);
  });
});

describe('derivePracticePlan — 3-drill cap', () => {
  it('never returns more than 3 drills even with many eligible insights', () => {
    const drills = derivePracticePlan({
      insights: [
        makeInsight({ id: 'a', category: 'putting', priority: 'urgent' }),
        makeInsight({ id: 'b', category: 'approach', priority: 'urgent' }),
        makeInsight({ id: 'c', category: 'short_game', priority: 'urgent' }),
        makeInsight({ id: 'd', category: 'tee', priority: 'urgent' }),
        makeInsight({ id: 'e', category: 'scoring', priority: 'urgent' }),
      ],
      patterns: [],
      categoryBreakdown: ZERO_BREAKDOWN,
      focusAreas: [],
    });
    expect(drills).toHaveLength(3);
  });

  it('tops up from category fallback but still stops at 3', () => {
    const drills = derivePracticePlan({
      insights: [makeInsight({ id: 'a', category: 'putting', priority: 'urgent' })],
      patterns: [],
      categoryBreakdown: { teeGame: 10, approach: 20, shortGame: 30, putting: 100, scoring: 100 },
      focusAreas: [],
    });
    expect(drills).toHaveLength(3);
    expect(drills[0]?.sourceInsightId).toBe('a');
  });
});
