// =============================================================================
// Regression test: runBaseballEngineCore must read lift sessions + set results
// from the unified helm_lifting_sessions / helm_lifting_set_results tables,
// not the legacy baseball_lift_sessions / baseball_lift_set_results tables
// (which hold 0 rows for real activity since the W2-G rewire — the engine was
// blind to all real lifting data reading them, per the clean-slate audit).
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import { DEFAULT_AI_POLICY } from '@/lib/baseball/ai-policy';
import type { BaseballInsightCandidate } from '@/lib/coachhelm/baseball/generators';
import type { BaseballV10EngineInputs } from '@/lib/coachhelm/baseball/engine';

const NOW = '2026-06-30T12:00:00.000Z';
const TEAM_ID = 'team-1';
const ORG_ID = 'org-1';
const PLAYER_ID = 'player-1';
const ATHLETE_ID = 'athlete-1';

let capturedInputs: BaseballV10EngineInputs | null = null;

vi.mock('@/lib/coachhelm/baseball/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/baseball/engine')>();
  return {
    ...actual,
    generateAllBaseballCandidates: vi.fn((inputs: BaseballV10EngineInputs) => {
      capturedInputs = inputs;
      return [] as BaseballInsightCandidate[];
    }),
  };
});

import { runBaseballEngineCore, type EngineRunClient } from '@/lib/baseball/coachhelm/engine-run';

function baseTables() {
  return {
    baseball_team_members: [{ team_id: TEAM_ID, player_id: PLAYER_ID }],
    // No box-score stat table key needed — the fake-supabase harness
    // defaults an unseeded table to []. That table is deprecated (see
    // stat-layer-manifest.ts / #381) and is deliberately not referenced here.
    baseball_events: [],
    baseball_teams: [{ id: TEAM_ID, organization_id: ORG_ID }],
    helm_lifting_athletes: [
      { id: ATHLETE_ID, organization_id: ORG_ID, sport: 'baseball', sport_player_id: PLAYER_ID },
    ],
    helm_lifting_readiness_checkins: [] as Array<Record<string, unknown>>,
    // Legacy tables seeded ON PURPOSE with rows that would satisfy the OLD
    // (pre-rewire) query shape — proves the engine no longer reads them.
    baseball_lift_sessions: [
      { id: 'legacy-sess-1', team_id: TEAM_ID, player_id: PLAYER_ID, scheduled_date: '2026-06-25', status: 'completed' },
    ],
    baseball_lift_set_results: [
      { id: 'legacy-set-1', team_id: TEAM_ID, player_id: PLAYER_ID, completed_at: '2026-06-29T00:00:00.000Z', rpe: 9 },
    ],
    helm_lifting_sessions: [] as Array<Record<string, unknown>>,
    helm_lifting_set_results: [] as Array<Record<string, unknown>>,
    baseball_import_runs: [],
    baseball_pitch_events: [],
    baseball_batted_ball_events: [],
    baseball_catching_events: [],
    baseball_fielding_events: [],
    baseball_baserunning_events: [],
    baseball_video_events: [],
    baseball_coach_insights: [] as Array<Record<string, unknown>>,
    baseball_signals: [] as Array<Record<string, unknown>>,
    baseball_ai_audit: [] as Array<Record<string, unknown>>,
  };
}

async function runEngine(fake: FakeSupabase) {
  return runBaseballEngineCore(fake as unknown as EngineRunClient, {
    teamId: TEAM_ID,
    coachId: 'coach-1',
    createdByUserId: 'user-1',
    policy: DEFAULT_AI_POLICY,
    nowIso: NOW,
  });
}

describe('runBaseballEngineCore — lift data reads helm_lifting_* (unified), not legacy baseball_lift_*', () => {
  it('ignores rows seeded ONLY in the legacy baseball_lift_sessions / baseball_lift_set_results tables', async () => {
    capturedInputs = null;
    const tables = baseTables(); // legacy tables have rows; helm tables are empty
    const fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const result = await runEngine(fake);
    expect(result.success).toBe(true);
    expect(capturedInputs).not.toBeNull();

    const player = capturedInputs!.players.find((p) => p.playerId === PLAYER_ID);
    expect(player).toBeDefined();
    // Neither lift metric should be populated: the legacy rows are invisible
    // to the (correctly) rewired engine.
    expect(player!.metrics.lift_completion_rate).toBeUndefined();
    expect(player!.metrics.lift_rpe_avg).toBeUndefined();
  });

  it('reads real lift compliance + RPE from helm_lifting_sessions / helm_lifting_set_results', async () => {
    capturedInputs = null;
    const tables = baseTables();
    tables.helm_lifting_sessions = [
      {
        id: 'helm-sess-1',
        organization_id: ORG_ID,
        sport: 'baseball',
        team_id: TEAM_ID,
        athlete_id: ATHLETE_ID,
        scheduled_date: '2026-06-25',
        status: 'completed',
      },
    ];
    tables.helm_lifting_set_results = [
      {
        id: 'helm-set-1',
        organization_id: ORG_ID,
        sport: 'baseball',
        athlete_id: ATHLETE_ID,
        completed_at: '2026-06-29T00:00:00.000Z',
        rpe: 8,
      },
    ];
    const fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const result = await runEngine(fake);
    expect(result.success).toBe(true);
    expect(capturedInputs).not.toBeNull();

    const player = capturedInputs!.players.find((p) => p.playerId === PLAYER_ID);
    expect(player).toBeDefined();
    // The helm session (athlete_id -> player_id resolved via helm_lifting_athletes)
    // feeds lift_completion_rate: 1 due session, 1 completed => rate 1.
    expect(player!.metrics.lift_completion_rate?.value).toBe(1);
    // The helm set result feeds the rolling RPE average.
    expect(player!.metrics.lift_rpe_avg?.value).toBe(8);
  });
});
