/**
 * TS4 / H6 (COACHHELM_INSIGHT_ENGINE_AUDIT_2026-06-05 §H6): priority/severity
 * must re-persist on the dedup UPDATE path, not only on INSERT.
 *
 * Value-derived single-metric generators recompute priority every run. Before
 * the fix, `updateExisting` (both the <5% refresh branch and the >5% movement
 * branch) rebuilt its UPDATE payload WITHOUT `priority`, so an insight that
 * escalated to 'high' kept its stale INSERT-time value — wrong in the Alert
 * Center's ['urgent','high'] filter and ordering (insight-delivery.ts).
 *
 * The audit flagged this as a SILENT regression: "deleting the line still
 * passes 100% of tests." These are the tests that CATCH that deletion — if
 * upsert.ts:205 or :261 (`if (input.priority) payload.priority = input.priority`)
 * is removed, the UPDATE-payload assertions below fail.
 */
import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import type { InsightEvidence, InsightInput } from '@/lib/coachhelm/v2/insights/types';

const now = new Date().toISOString();

function baseEvidence(over: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'penalty_rate_per_round',
    metric_label: 'Penalties per Round',
    unit: 'count',
    your_value: 1.0,
    your_value_display: '1.0',
    comparison_value: 0.4,
    comparison_label: 'Division II average',
    comparison_source: 'd2_avg',
    sample_n: 20,
    window_days: 30,
    window_start: new Date(Date.now() - 30 * 86400e3).toISOString(),
    window_end: now,
    strokes_impact: 0.7,
    strokes_impact_method: 'peer_delta',
    confidence: 0,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
    ...over,
  };
}

function makeInput(over: Partial<InsightInput> = {}): InsightInput {
  return {
    player_id: 'player-1',
    coach_id: 'coach-1',
    team_id: 'team-1',
    category: 'course_management',
    insight_type: 'value_derived',
    signature: 'v3:penalty_rate:player-1',
    title: 'Penalties up',
    content: 'Your penalty rate climbed.',
    evidence: baseEvidence(),
    metadata: {},
    ...over,
  };
}

/** A pre-existing row whose stored priority is the STALE 'low'. */
function existingRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ins-1',
    player_id: 'player-1',
    coach_id: 'coach-1',
    team_id: 'team-1',
    signature: 'v3:penalty_rate:player-1',
    lifecycle_state: 'detected',
    priority: 'low', // stale — escalated since
    evidence: baseEvidence({ your_value: 1.0 }),
    metadata: { movement_count: 0 },
    content: 'old',
    title: 'old',
    created_at: now,
    updated_at: now,
    ...over,
  };
}

describe('upsertInsight re-persists priority on UPDATE (H6 / TS4)', () => {
  it('small-wiggle refresh branch (<5% move) writes the freshly-computed priority', async () => {
    const supabase = createFakeSupabase({
      tables: {
        golf_coach_insights: [existingRow()],
        golf_team_members: [],
        golf_team_coach_staff: [],
      },
    });

    // 1.0 -> 1.02 = 2% move (< 5% MOVEMENT_THRESHOLD) → refresh branch.
    await upsertInsight(
      supabase as never,
      makeInput({ priority: 'high', evidence: baseEvidence({ your_value: 1.02 }) }),
    );

    const { data } = await supabase.from('golf_coach_insights').select('*');
    const row = (data ?? []).find((r) => r['id'] === 'ins-1');
    // The escalation must have landed on the existing row — not the stale 'low'.
    expect(row?.['priority']).toBe('high');
    // Still a single row (UPDATE, not a new INSERT).
    expect(data?.length).toBe(1);
  });

  it('movement branch (>5% move) writes the freshly-computed priority', async () => {
    const supabase = createFakeSupabase({
      tables: {
        golf_coach_insights: [existingRow()],
        golf_team_members: [],
        golf_team_coach_staff: [],
      },
    });

    // 1.0 -> 1.5 = +50% move (>= 5%) → movement branch.
    await upsertInsight(
      supabase as never,
      makeInput({ priority: 'urgent', evidence: baseEvidence({ your_value: 1.5 }) }),
    );

    const { data } = await supabase.from('golf_coach_insights').select('*');
    const row = (data ?? []).find((r) => r['id'] === 'ins-1');
    expect(row?.['priority']).toBe('urgent');
    expect(data?.length).toBe(1);
  });

  it('de-escalation also re-persists (high → low when the leak shrinks)', async () => {
    const supabase = createFakeSupabase({
      tables: {
        golf_coach_insights: [existingRow({ priority: 'high' })],
        golf_team_members: [],
        golf_team_coach_staff: [],
      },
    });

    await upsertInsight(
      supabase as never,
      makeInput({ priority: 'low', evidence: baseEvidence({ your_value: 1.01 }) }),
    );

    const { data } = await supabase.from('golf_coach_insights').select('*');
    const row = (data ?? []).find((r) => r['id'] === 'ins-1');
    expect(row?.['priority']).toBe('low');
  });

  it('does NOT clobber the stored priority when the input omits it (composite/no-op case)', async () => {
    const supabase = createFakeSupabase({
      tables: {
        golf_coach_insights: [existingRow({ priority: 'high' })],
        golf_team_members: [],
        golf_team_coach_staff: [],
      },
    });

    // No `priority` on the input → the existing stored value must survive.
    await upsertInsight(
      supabase as never,
      makeInput({ priority: undefined, evidence: baseEvidence({ your_value: 1.01 }) }),
    );

    const { data } = await supabase.from('golf_coach_insights').select('*');
    const row = (data ?? []).find((r) => r['id'] === 'ins-1');
    expect(row?.['priority']).toBe('high');
  });
});
