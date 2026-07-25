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
import lagDistance3Putt from '@/lib/coachhelm/v3/composite/rules/lag-distance-3putt';
import { isSubsumedBy } from '@/lib/coachhelm/v3/composite/synthesis';
import type { EvidenceInsight } from '@/lib/coachhelm/v3/composite/types';

/**
 * Putt-distance insight with an explicit standing baseline. Used by the
 * absolute-skill-floor tests (lag3putt-2 / PDC-1): a tiny-team `team_pct = 0`
 * must NOT flag a player whose make-% already beats the PGA baseline.
 */
function puttInsight(over: {
  signature: string;
  your_value: number;
  team_pct: number;
  pga_value: number;
}): EvidenceInsight {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidence: any = {
    metric: 'putt_distance',
    metric_label: 'putt_distance',
    unit: 'percent',
    your_value: over.your_value,
    your_value_display: `${over.your_value}%`,
    comparison_value: over.pga_value,
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
    standing: {
      metric_id: 'putt_distance',
      player_value: over.your_value,
      team_avg: 0,
      team_n: 2,
      team_pct: over.team_pct,
      pga_value: over.pga_value,
      pga_delta: null,
      computed_at: '2026-05-25T00:00:00.000Z',
    },
  };
  return {
    id: `insight-${over.signature}`,
    insight_type: 'putt_distance',
    category: 'putt_distance',
    signature: over.signature,
    player_id: 'p-1',
    evidence,
    engine_version: 'v3',
    created_at: '2026-05-25T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Insight fixture builder
// ---------------------------------------------------------------------------

function makeInsight(over: Partial<EvidenceInsight> & {
  type: string;
  signature: string;
  your_value?: number;
  team_pct?: number | null;
  /** On-green proximity (feet) for approach_miss — lands in evidence.detail,
   *  NOT your_value (which is the green-hit PERCENT post the reach/dial-in
   *  redesign). */
  proximity_feet?: number | null;
  sample_n?: number;
}): EvidenceInsight {
  const { type, signature, your_value, team_pct, proximity_feet, sample_n, ...rest } = over;
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
    sample_n: sample_n ?? 10,
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
  if (proximity_feet !== undefined) {
    evidence.detail = { proximity_when_hit_feet: proximity_feet };
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

  it('derives sample_n as the MIN of its two sources, not a hardcoded literal', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'scrambling', signature: 'v3:scrambling:sand', your_value: 35, team_pct: 25, sample_n: 23 }),
      makeInsight({ type: 'putt_bias', signature: 'v3:putt_bias:left', your_value: 25, sample_n: 9 }),
    ];
    const match = bunkerMissSide.detect(insights);
    expect(match).not.toBeNull();
    expect(Number(match!.signals.sample_n)).toBe(9);
    const composed = bunkerMissSide.compose(match!);
    expect(composed.evidence.sample_n).toBe(9); // the thinner source, never the old literal 5
  });
});

// ---------------------------------------------------------------------------
// long_approach_3putt_cascade
// ---------------------------------------------------------------------------

describe('long_approach_3putt_cascade', () => {
  it('fires on poor on-green proximity (feet) + weak 10-15 ft putts — NOT on green-hit %', () => {
    const insights: EvidenceInsight[] = [
      // your_value is the green-hit PERCENT (45% — a reach signal); the dial-in
      // proximity (60 ft, > Tour 45) is what fires the cascade and is displayed.
      makeInsight({
        type: 'approach_miss',
        signature: 'v3:approach_miss:175_plus_ft',
        your_value: 45,
        proximity_feet: 60,
      }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:10_15ft', your_value: 22, team_pct: 30 }),
    ];
    const match = longApproach3Putt.detect(insights);
    expect(match).not.toBeNull();
    const composed = longApproach3Putt.compose(match!);
    expect(composed.title).toContain('Long approaches are leaking 3-putts');
    expect(composed.content).toContain('60 ft'); // the real proximity, not the 45% green-hit
    expect(composed.content).not.toContain('45 ft'); // must never print the percent as feet
    expect(composed.content).toContain('22%');
  });

  it('does NOT fire on a GOOD ball-striker (high green-hit %, no recorded proximity)', () => {
    const insights: EvidenceInsight[] = [
      // 70% greens hit, proximity null (the old bug fired here because >50 matched the percent).
      makeInsight({
        type: 'approach_miss',
        signature: 'v3:approach_miss:175_plus_ft',
        your_value: 70,
        proximity_feet: null,
      }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:10_15ft', your_value: 22, team_pct: 30 }),
    ];
    expect(longApproach3Putt.detect(insights)).toBeNull();
  });

  it('does NOT fire when on-green proximity is good (≤ 50 ft)', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({
        type: 'approach_miss',
        signature: 'v3:approach_miss:175_plus_ft',
        your_value: 55,
        proximity_feet: 42,
      }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:10_15ft', your_value: 22, team_pct: 30 }),
    ];
    expect(longApproach3Putt.detect(insights)).toBeNull();
  });

  it('does NOT fire when mid putts are above team avg', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({
        type: 'approach_miss',
        signature: 'v3:approach_miss:175_plus_ft',
        your_value: 45,
        proximity_feet: 60,
      }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:10_15ft', your_value: 40, team_pct: 70 }),
    ];
    expect(longApproach3Putt.detect(insights)).toBeNull();
  });

  it('derives sample_n as the MIN of its two sources, not a hardcoded literal', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({
        type: 'approach_miss',
        signature: 'v3:approach_miss:175_plus_ft',
        your_value: 45,
        proximity_feet: 60,
        sample_n: 14,
      }),
      makeInsight({
        type: 'putt_distance',
        signature: 'v3:putt_distance:10_15ft',
        your_value: 22,
        team_pct: 30,
        sample_n: 33,
      }),
    ];
    const match = longApproach3Putt.detect(insights);
    expect(match).not.toBeNull();
    expect(Number(match!.signals.sample_n)).toBe(14);
    const composed = longApproach3Putt.compose(match!);
    expect(composed.evidence.sample_n).toBe(14); // the thinner source, never the old literal 5
  });
});

// ---------------------------------------------------------------------------
// Absolute-skill floor (lag3putt-2 / PDC-1)
// ---------------------------------------------------------------------------

describe('absolute-skill floor', () => {
  // PGA make-% anchors (higher_better): 3-5 ft ~93%, 15+ ft ~22%.
  const PGA_3_5 = 93;
  const PGA_LONG = 22;

  it('lag_distance_3putt does NOT fire for an elite 3-5 ft putter at team_pct=0', () => {
    // 94.8% from 3-5 ft beats the PGA floor → must not be flagged "weak"
    // even though a team of two puts them at PERCENT_RANK 0.
    const insights = [
      puttInsight({ signature: 'v3:putt_distance:25_plus_ft', your_value: 8, team_pct: 0, pga_value: PGA_LONG }),
      puttInsight({ signature: 'v3:putt_distance:3_5ft', your_value: 94.8, team_pct: 0, pga_value: PGA_3_5 }),
    ];
    expect(lagDistance3Putt.detect(insights)).toBeNull();
  });

  it('lag_distance_3putt STILL fires when both buckets are genuinely below PGA', () => {
    const insights = [
      puttInsight({ signature: 'v3:putt_distance:25_plus_ft', your_value: 8, team_pct: 30, pga_value: PGA_LONG }),
      puttInsight({ signature: 'v3:putt_distance:3_5ft', your_value: 75, team_pct: 30, pga_value: PGA_3_5 }),
    ];
    expect(lagDistance3Putt.detect(insights)).not.toBeNull();
  });

  it('lag_distance_3putt falls back to team gate when pga_value is unset (no regression)', () => {
    // pga_value 0 → floor defers to the team-rank gate (prior behavior).
    const insights = [
      puttInsight({ signature: 'v3:putt_distance:25_plus_ft', your_value: 8, team_pct: 30, pga_value: 0 }),
      puttInsight({ signature: 'v3:putt_distance:3_5ft', your_value: 75, team_pct: 30, pga_value: 0 }),
    ];
    expect(lagDistance3Putt.detect(insights)).not.toBeNull();
  });

  it('pressure_decel_chain does NOT fire for an elite short putter at team_pct=0', () => {
    const insights: EvidenceInsight[] = [
      makeInsight({ type: 'pressure_gap', signature: 'v3:pressure_gap:practice_vs_tournament', your_value: 1.5 }),
      puttInsight({ signature: 'v3:putt_distance:3_5ft', your_value: 94.8, team_pct: 0, pga_value: PGA_3_5 }),
    ];
    expect(pressureDecel.detect(insights)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Subset suppression (the conflict-resolution logic the runner applies)
// ---------------------------------------------------------------------------

describe('subset suppression (isSubsumedBy — the real synthesis predicate)', () => {
  // Mirror of the runner's filter, but using the EXPORTED predicate so the
  // contract is tested directly rather than reimplemented.
  function survivors(matches: { id: string; ids: string[] }[]): string[] {
    return matches
      .filter((cand) => !matches.some((other) => other !== cand && isSubsumedBy(cand.ids, other.ids)))
      .map((m) => m.id);
  }

  it('suppresses a rule whose source_insight_ids ⊂ another rule that also fired', () => {
    expect(
      survivors([
        { id: 'A', ids: ['i-1', 'i-2', 'i-3'] },
        { id: 'B', ids: ['i-1', 'i-2'] },
      ]),
    ).toEqual(['A']);
  });

  it("keeps independent matches that don't overlap", () => {
    expect(
      survivors([
        { id: 'A', ids: ['i-1', 'i-2'] },
        { id: 'B', ids: ['i-3', 'i-4'] },
      ]),
    ).toEqual(['A', 'B']);
  });

  it('does NOT suppress ctx composites (empty source_insight_ids) when an insight-driven composite fires', () => {
    // Regression for the empty-array vacuous-subset bug: an insight-driven
    // composite (≥1 source) must NOT delete every ctx composite ([]).
    expect(
      survivors([
        { id: 'insight_driven', ids: ['i-1', 'i-2'] },
        { id: 'closing_hole_fatigue', ids: [] },
        { id: 'doubles_after_bogey', ids: [] },
      ]),
    ).toEqual(['insight_driven', 'closing_hole_fatigue', 'doubles_after_bogey']);
  });

  it('empty-vs-empty never suppress each other', () => {
    expect(isSubsumedBy([], [])).toBe(false);
    expect(isSubsumedBy([], ['x'])).toBe(false);
  });
});
