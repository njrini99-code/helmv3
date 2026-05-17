import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import type { InsightInput } from '@/lib/coachhelm/v2/insights/types';

/**
 * S-HIGH-1 / Q-NEW-2 / Q-NEW-3 regression: dedup must include coach_id +
 * team_id so coach B at org Y cannot silently overwrite an insight authored
 * by coach A at org X when they share a player (transferred athlete).
 *
 * Before 2026-05-17, dedup keyed only on (signature, player_id) and coach B's
 * upsert mutated coach A's row. After the fix, the upsert finds no matching
 * row in coach B's scope and inserts a new one, leaving coach A's untouched.
 */

const now = new Date().toISOString();
const baseEvidence = {
  metric: 'putt_make_rate_6_10ft',
  metric_label: 'Make rate from 6–10ft',
  unit: 'percent' as const,
  your_value: 0.3,
  your_value_display: '30%',
  comparison_value: 0.48,
  comparison_label: 'Division II average',
  comparison_source: 'd2_avg' as const,
  sample_n: 25,
  window_days: 30,
  window_start: new Date(Date.now() - 30 * 86400e3).toISOString(),
  window_end: now,
  strokes_impact: 0.5,
  strokes_impact_method: 'peer_delta' as const,
  confidence: 0,
  confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
};

function makeInput(overrides: Partial<InsightInput>): InsightInput {
  return {
    player_id: 'player-shared',
    coach_id: 'coach-A',
    team_id: 'team-A',
    category: 'putting',
    insight_type: 'pattern',
    signature: 'shared-sig',
    title: 'Default title',
    content: 'Default content',
    evidence: baseEvidence,
    metadata: {},
    ...overrides,
  };
}

describe('upsertInsight cross-coach scoping (S-HIGH-1)', () => {
  it('does not update coach A insight when coach B upserts for same player', async () => {
    const supabase = createFakeSupabase({
      tables: {
        golf_coach_insights: [
          {
            id: 'ins-a',
            player_id: 'player-shared',
            coach_id: 'coach-A',
            team_id: 'team-A',
            signature: 'shared-sig',
            lifecycle_state: 'detected',
            evidence: baseEvidence,
            metadata: {},
            content: 'coach A wrote this',
            title: 'A title',
            created_at: now,
            updated_at: now,
          },
        ],
        // Resolution tables consulted by resolvePlayerOwnership — empty here
        // because the caller supplies coach_id + team_id explicitly.
        golf_team_members: [],
        golf_team_coach_staff: [],
      },
    });

    await upsertInsight(
      supabase as never,
      makeInput({
        coach_id: 'coach-B',
        team_id: 'team-B',
        content: 'coach B wrote this',
        title: 'B title',
      }),
    );

    const { data } = await supabase.from('golf_coach_insights').select('*');
    const rows = data ?? [];
    const coachAInsight = rows.find((r) => r['coach_id'] === 'coach-A');
    const coachBInsight = rows.find((r) => r['coach_id'] === 'coach-B');
    expect(coachAInsight?.['content']).toBe('coach A wrote this');
    expect(coachBInsight?.['content']).toBe('coach B wrote this');
    expect(rows.length).toBe(2);
  });

  it('still dedups within the same (coach, team, player, signature) scope', async () => {
    const supabase = createFakeSupabase({
      tables: {
        golf_coach_insights: [
          {
            id: 'ins-a',
            player_id: 'player-shared',
            coach_id: 'coach-A',
            team_id: 'team-A',
            signature: 'shared-sig',
            lifecycle_state: 'detected',
            evidence: baseEvidence,
            metadata: {},
            content: 'first',
            title: 'A title',
            created_at: now,
            updated_at: now,
          },
        ],
        golf_team_members: [],
        golf_team_coach_staff: [],
      },
    });

    await upsertInsight(
      supabase as never,
      makeInput({ coach_id: 'coach-A', team_id: 'team-A', content: 'updated content' }),
    );

    const { data } = await supabase.from('golf_coach_insights').select('*');
    // Still only one row — the second upsert matched and updated the first.
    expect(data?.length).toBe(1);
  });
});
