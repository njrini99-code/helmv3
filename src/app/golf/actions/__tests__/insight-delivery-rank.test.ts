import { describe, it, expect } from 'vitest';
import { rankEvidenceInsights } from '@/app/golf/actions/insight-delivery';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { scoreInsight } from '@/lib/coachhelm/v3/ranking/score';

const mk = (over: Partial<EvidenceInsight['evidence']> & {
  priority?: EvidenceInsight['priority'];
  created_at?: string;
  id?: string;
  insight_type?: string;
  category?: EvidenceInsight['category'];
}): EvidenceInsight => ({
  id: over.id ?? Math.random().toString(36),
  player_id: 'p1',
  category: over.category ?? 'putting',
  insight_type: over.insight_type ?? 'putt_make_rate',
  title: 't',
  content: 'c',
  signature: 'v3:x',
  evidence: {
    metric: over.metric ?? 'putts_made_5_10ft_pct',
    metric_label: 'L',
    unit: 'percent',
    your_value: 0,
    your_value_display: '0',
    comparison_value: 0,
    comparison_label: 'c',
    comparison_source: 'pga_baseline',
    sample_n: over.sample_n ?? 20,
    window_days: 90,
    window_start: '',
    window_end: '',
    strokes_impact: over.strokes_impact ?? 0,
    strokes_impact_method: 'peer_delta',
    confidence: over.confidence ?? 0.5,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
  },
  metadata: null,
  lifecycle_state: 'detected',
  status: 'active',
  priority: over.priority ?? 'low',
  acknowledged_at: null,
  resolved_at: null,
  created_at: over.created_at ?? '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

/** Minimal active Goal for the goal-boost ordering contract. */
const mkGoal = (over: Partial<Goal> & { metric_id?: Goal['metric_id']; category?: string }): Goal => ({
  id: over.id ?? Math.random().toString(36),
  player_id: 'p1',
  team_id: null,
  created_by_user_id: 'u1',
  creator_role: 'player',
  coach_id_if_assigned: null,
  metric_id: (over.metric_id ?? 'putts_made_5_10ft_pct') as Goal['metric_id'],
  title: 'g',
  category: over.category ?? 'putting',
  started_at: '2026-01-01T00:00:00Z',
  ends_at: '2026-12-01T00:00:00Z',
  window_days: 90,
  baseline_value: null,
  current_value: null,
  target_value: null,
  target_source: null,
  state: over.state ?? 'active',
  outcome_evaluated_at: null,
  shared_with_coach: false,
  shared_at: null,
  coach_assignment_mode: null,
  player_accepted_at: null,
  player_declined_at: null,
  origin: 'manual',
  origin_insight_id: null,
  snapshots: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('rankEvidenceInsights (flat-feed ordering contract)', () => {
  it('a high-confidence zero-impact approach diagnostic outranks an older zero-impact low-conf row', () => {
    const strong = mk({ metric: 'approach_proximity_175_plus_ft', confidence: 0.9, strokes_impact: 0, created_at: '2026-01-01T00:00:00Z' });
    const weakButNewer = mk({ metric: 'penalty_rate_per_round', confidence: 0.3, strokes_impact: 0, created_at: '2026-06-01T00:00:00Z' });
    const out = rankEvidenceInsights([weakButNewer, strong], {}, []);
    expect(out[0]!.evidence.metric).toBe('approach_proximity_175_plus_ft');
  });

  it('an urgent insight leads even when a non-urgent has higher impact', () => {
    const urgent = mk({ metric: 'three_putt_chain', priority: 'urgent', strokes_impact: 0.4, confidence: 0.5 });
    const bigHigh = mk({ metric: 'scrambling_pct_sand', priority: 'high', strokes_impact: 6, confidence: 1 });
    const out = rankEvidenceInsights([bigHigh, urgent], {}, []);
    expect(out[0]!.evidence.metric).toBe('three_putt_chain');
  });

  it('a descriptive par-scoring row sinks below an actionable zero-impact diagnostic', () => {
    const par = mk({ metric: 'scoring_par_4', priority: 'medium', strokes_impact: 0, confidence: 1 });
    const diag = mk({ metric: 'putts_made_5_10ft_pct', priority: 'low', strokes_impact: 0, confidence: 0.5 });
    const out = rankEvidenceInsights([par, diag], {}, []);
    expect(out[0]!.evidence.metric).toBe('putts_made_5_10ft_pct');
  });

  it('a thin-sample zero-impact row sinks below a deep-sample peer', () => {
    const thin = mk({ metric: 'putts_made_25_plus_ft_pct', sample_n: 3, strokes_impact: 0, confidence: 0.5, id: 'thin' });
    const deep = mk({ metric: 'putts_made_25_plus_ft_pct', sample_n: 40, strokes_impact: 0, confidence: 0.5, id: 'deep' });
    const out = rankEvidenceInsights([thin, deep], {}, []);
    expect(out[0]!.id).toBe('deep');
  });

  it('an up-weighted insight_type outranks an equal row of a different type', () => {
    // Two rows identical in EVERY scoring input except insight_type (same metric
    // → same coachability, same sample/confidence/impact/priority). The weights
    // map is keyed by the insight_type COLUMN — if feedRankScore mis-reads
    // insight_type (e.g. falls back to category, which is identical for both
    // rows here), neither matches the key and order falls to the created_at
    // tie-break, leaving the wrong (newer) row first.
    const upweighted = mk({ insight_type: 'putt_distance_control', metric: 'putts_made_5_10ft_pct', id: 'up', created_at: '2026-01-01T00:00:00Z' });
    const neutral = mk({ insight_type: 'putt_make_rate', metric: 'putts_made_5_10ft_pct', id: 'neutral', created_at: '2026-06-01T00:00:00Z' });
    const out = rankEvidenceInsights([neutral, upweighted], { putt_distance_control: 2.0 }, []);
    expect(out[0]!.id).toBe('up');
  });

  it('an active goal CAUSES a reorder — the goal touch is the sole differentiator', () => {
    // Causal-reorder design: the two rows are identical in every scoring input
    // EXCEPT metric, and both metrics sit in the same coachable-timeframe bucket
    // (putts_made_10_15ft_pct and putts_made_15_25ft_pct are both 8 weeks →
    // coachability 1.0), so they tie on score with no goal. otherRow is NEWER,
    // so WITHOUT a goal it wins the created_at tie-break and ranks first.
    //
    // The goal matches ONLY goalRow — by metric_id — and its category is
    // 'approach', which matches NEITHER row's 'putting' category, so there is no
    // category-match cross-contamination (the bug in the prior version, where a
    // 'putting' goal boosted both rows equally and the test passed regardless of
    // the goal). The 1.5× boost on goalRow alone flips the order. Asserting BOTH
    // directions proves the goal — not coachability or recency — caused the
    // reorder, so the test FAILS if goal-boost is disabled (it then degrades to
    // the no-goal tie-break and otherRow stays first).
    const goalRow = mk({ metric: 'putts_made_10_15ft_pct', id: 'goal', created_at: '2026-01-01T00:00:00Z' });
    const otherRow = mk({ metric: 'putts_made_15_25ft_pct', id: 'other', created_at: '2026-06-01T00:00:00Z' });

    // Without the goal: pure tie → newer (otherRow) leads.
    const withoutGoal = rankEvidenceInsights([goalRow, otherRow], {}, []);
    expect(withoutGoal[0]!.id).toBe('other');

    // With a goal touching ONLY goalRow (metric match; non-matching category):
    // the 1.5× boost flips the order so goalRow leads despite being older.
    const goals = [mkGoal({ metric_id: 'putts_made_10_15ft_pct', category: 'approach' })];
    const withGoal = rankEvidenceInsights([otherRow, goalRow], {}, goals);
    expect(withGoal[0]!.id).toBe('goal');
  });
});

describe('dashboard path uses the same floor/damping contract', () => {
  it('a dashboard row WITHOUT priority/sample_n ranks below the SAME row WITH high priority + deep sample', () => {
    const bare = { insight_type: 'x', strokes_impact: 0, confidence: 0.6, metric: 'putts_made_5_10ft_pct' };
    const enriched = { ...bare, priority: 'high' as const, sample_n: 40 };
    expect(scoreInsight(enriched, {})).toBeGreaterThan(scoreInsight(bare, {}));
  });
});
