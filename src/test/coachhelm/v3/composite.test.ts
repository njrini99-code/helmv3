/**
 * W28 composite framework — rule detect/compose + subset-suppression.
 *
 * Doesn't exercise the full synthesizeForPlayer (that hits Supabase).
 * Instead tests each rule in isolation + a unit test for the subset-
 * suppression logic the runner applies.
 */

import { describe, it, expect } from 'vitest';
import pressureDecel from '@/lib/coachhelm/v3/composite/rules/pressure-decel-chain';
import bunkerMissSide from '@/lib/coachhelm/v3/composite/rules/bunker-miss-side-amplifier';
import longApproach3Putt from '@/lib/coachhelm/v3/composite/rules/long-approach-3putt-cascade';
import type { EvidenceInsight } from '@/lib/coachhelm/v3/composite/types';

// ---------------------------------------------------------------------------
// Insight fixture builder
// ---------------------------------------------------------------------------

function makeInsight(over: Partial<EvidenceInsight> & {
  type: string;
  signature: string;
  your_value?: number;
  team_pct?: number | null;
}): EvidenceInsight {
  const { type, signature, your_value, team_pct, ...rest } = over;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidence: any = {
    metric: type,
    metric_label: type,
    unit: 'percent',
    your_value: your_value ?? 0,
    your_value_display: String(your_value ?? 0),
    comparison_value: 0,
    comparison_label: '',
    comparison_source: 'pga_baseline',
    sample_n: 10,
    window_days: 90,
    window_start: '',
    window_end: '',
    strokes_impact: 0,
    strokes_impact_method: 'peer_delta',
    confidence: 0.5,
    confidence_factors: { sample_adequacy: 0.5, recency: 1, variance: 0.5 },
  };
  if (team_pct !== undefined) {
    evidence.standing = {
      metric_id: type,
      player_value: your_value ?? 0,
      team_avg: 0,
      team_n: 5,
      team_pct,
      pga_value: 0,
      pga_delta: null,
      computed_at: '2026-05-25T00:00:00.000Z',
    };
  }
  return {
    id: `insight-${signature}`,
    insight_type: type,
    category: type,
    signature,
    player_id: 'p-1',
    evidence,
    engine_version: 'v3',
    created_at: '2026-05-25T00:00:00.000Z',
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// pressure_decel_chain
// ---------------------------------------------------------------------------

describe('pressure_decel_chain', () => {
  it('fires when pressure_gap + weak 3-5 ft putt both present', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'pressure_gap', signature: 'v3:pressure_gap:practice_vs_tournament', your_value: 1.2 }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:3_5ft', your_value: 75, team_pct: 30 }),
    ];
    const match = pressureDecel.detect(insights);
    expect(match).not.toBeNull();
    expect(match!.source_insight_ids).toHaveLength(2);
    const composed = pressureDecel.compose(match!);
    expect(composed.title).toContain('Pressure shows up in your short putts');
    expect(composed.content).toContain('3-5 ft');
    expect(composed.content).toContain('75%');
  });

  it('does NOT fire when pressure_gap is below 0.3 strokes', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'pressure_gap', signature: 'v3:pressure_gap:practice_vs_tournament', your_value: 0.1 }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:3_5ft', your_value: 75, team_pct: 30 }),
    ];
    expect(pressureDecel.detect(insights)).toBeNull();
  });

  it('does NOT fire when putt is above team avg', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'pressure_gap', signature: 'v3:pressure_gap:practice_vs_tournament', your_value: 1.5 }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:3_5ft', your_value: 88, team_pct: 75 }),
    ];
    expect(pressureDecel.detect(insights)).toBeNull();
  });

  it('does NOT fire when either source insight is missing', () => {
    expect(
      pressureDecel.detect([
        makeInsight({ type: 'pressure_gap', signature: 'v3:pressure_gap:practice_vs_tournament', your_value: 1.5 }),
      ]),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// bunker_miss_side_amplifier
// ---------------------------------------------------------------------------

describe('bunker_miss_side_amplifier', () => {
  it('fires with weak sand save + left putt-bias', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'scrambling', signature: 'v3:scrambling:sand', your_value: 35, team_pct: 25 }),
      makeInsight({ type: 'putt_bias', signature: 'v3:putt_bias:left', your_value: 25 }),
    ];
    const match = bunkerMissSide.detect(insights);
    expect(match).not.toBeNull();
    expect(match!.signals.bias_direction).toBe('left');
    const composed = bunkerMissSide.compose(match!);
    expect(composed.title).toContain('left-bias');
    expect(composed.content).toContain('35%');
  });

  it('does NOT fire when sand save is healthy', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'scrambling', signature: 'v3:scrambling:sand', your_value: 60, team_pct: 70 }),
      makeInsight({ type: 'putt_bias', signature: 'v3:putt_bias:left', your_value: 25 }),
    ];
    expect(bunkerMissSide.detect(insights)).toBeNull();
  });

  it('does NOT fire when bias is straight', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'scrambling', signature: 'v3:scrambling:sand', your_value: 35, team_pct: 25 }),
      makeInsight({ type: 'putt_bias', signature: 'v3:putt_bias:straight', your_value: 38 }),
    ];
    expect(bunkerMissSide.detect(insights)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// long_approach_3putt_cascade
// ---------------------------------------------------------------------------

describe('long_approach_3putt_cascade', () => {
  it('fires when 175+ approach proximity is poor + 10-15 ft putts weak', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'approach_miss', signature: 'v3:approach_miss:175_plus_ft', your_value: 60 }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:10_15ft', your_value: 22, team_pct: 30 }),
    ];
    const match = longApproach3Putt.detect(insights);
    expect(match).not.toBeNull();
    const composed = longApproach3Putt.compose(match!);
    expect(composed.title).toContain('Long approaches are leaking 3-putts');
    expect(composed.content).toContain('60 ft');
    expect(composed.content).toContain('22%');
  });

  it('does NOT fire when long approach proximity is good', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'approach_miss', signature: 'v3:approach_miss:175_plus_ft', your_value: 42 }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:10_15ft', your_value: 22, team_pct: 30 }),
    ];
    expect(longApproach3Putt.detect(insights)).toBeNull();
  });

  it('does NOT fire when mid putts are above team avg', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'approach_miss', signature: 'v3:approach_miss:175_plus_ft', your_value: 60 }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:10_15ft', your_value: 40, team_pct: 70 }),
    ];
    expect(longApproach3Putt.detect(insights)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Subset suppression (the conflict-resolution logic the runner applies)
// ---------------------------------------------------------------------------

describe('subset suppression (synthesis runner logic)', () => {
  it('suppresses a rule whose source_insight_ids ⊆ another rule that also fired', () => {
    // Simulate two matches: ruleA (3 sources) and ruleB (2 of those 3).
    // ruleB.source_insight_ids ⊆ ruleA.source_insight_ids → ruleB suppressed.
    type M = { source_insight_ids: string[] };
    const ruleA: M = { source_insight_ids: ['i-1', 'i-2', 'i-3'] };
    const ruleB: M = { source_insight_ids: ['i-1', 'i-2'] };
    const matches = [
      { rule: { id: 'A' }, match: ruleA },
      { rule: { id: 'B' }, match: ruleB },
    ];
    // Same logic as synthesis.ts
    const survivors = matches.filter((cand) =>
      !matches.some(
        (other) =>
          other !== cand &&
          cand.match.source_insight_ids.length < other.match.source_insight_ids.length &&
          cand.match.source_insight_ids.every((id) => other.match.source_insight_ids.includes(id)),
      ),
    );
    expect(survivors.map((s) => s.rule.id)).toEqual(['A']);
  });

  it('keeps independent matches that don\'t overlap', () => {
    type M = { source_insight_ids: string[] };
    const matches = [
      { rule: { id: 'A' }, match: { source_insight_ids: ['i-1', 'i-2'] } as M },
      { rule: { id: 'B' }, match: { source_insight_ids: ['i-3', 'i-4'] } as M },
    ];
    const survivors = matches.filter((cand) =>
      !matches.some(
        (other) =>
          other !== cand &&
          cand.match.source_insight_ids.length < other.match.source_insight_ids.length &&
          cand.match.source_insight_ids.every((id) => other.match.source_insight_ids.includes(id)),
      ),
    );
    expect(survivors.map((s) => s.rule.id)).toEqual(['A', 'B']);
  });
});
