// =============================================================================
// Regression test: getStrengthGroupsBoard's per-player "has completed/
// incomplete lift" snapshot must read from the unified helm_lifting_sessions
// table, not the legacy baseball_lift_sessions table — which holds 0 rows for
// real activity since createLiftAssignment / publishLiftDay / logLiftResult
// write ONLY to helm_lifting_* now (the W2-G rewire). Before this fix, every
// player showed has_completed_lift=false / has_incomplete_lift=false
// regardless of real lifting activity, silently breaking any strength-group
// rule keyed on lift compliance.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

import { getStrengthGroupsBoard } from '@/lib/baseball/read-models/strength-groups';

const TEAM_ID = 'team-1';
const ORG_ID = 'org-1';
const PLAYER_ID = 'player-1';
const PLAYER_2_ID = 'player-2';
const ATHLETE_ID = 'athlete-1';
const ATHLETE_2_ID = 'athlete-2';

function recentYmd(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function baseTables() {
  return {
    // The fake-supabase QueryBuilder returns raw seeded rows verbatim (no
    // select-column projection), so pre-shaping the nested `baseball_players`
    // object reproduces exactly what `.select('player_id, baseball_players!
    // inner(...)')` would hand back from a real embedded join.
    baseball_team_members: [
      {
        team_id: TEAM_ID,
        player_id: PLAYER_ID,
        baseball_players: {
          id: PLAYER_ID, first_name: 'Jordan', last_name: 'Ríos',
          primary_position: 'SS', secondary_position: null, grad_year: 2027, weight_lbs: 185,
        },
      },
      {
        team_id: TEAM_ID,
        player_id: PLAYER_2_ID,
        baseball_players: {
          id: PLAYER_2_ID, first_name: 'Alex', last_name: 'Chen',
          primary_position: 'RHP', secondary_position: null, grad_year: 2026, weight_lbs: 200,
        },
      },
    ],
    baseball_teams: [{ id: TEAM_ID, organization_id: ORG_ID }],
    helm_lifting_athletes: [
      { id: ATHLETE_ID, organization_id: ORG_ID, sport: 'baseball', sport_player_id: PLAYER_ID, team_id: TEAM_ID },
      { id: ATHLETE_2_ID, organization_id: ORG_ID, sport: 'baseball', sport_player_id: PLAYER_2_ID, team_id: TEAM_ID },
    ],
    baseball_strength_groups: [] as Array<Record<string, unknown>>,
    baseball_strength_group_members: [] as Array<Record<string, unknown>>,
    baseball_games: [] as Array<Record<string, unknown>>,
    baseball_box_score_pitching: [] as Array<Record<string, unknown>>,
    baseball_box_score_batting: [] as Array<Record<string, unknown>>,
    baseball_availability_statuses: [] as Array<Record<string, unknown>>,
    helm_lifting_readiness_checkins: [] as Array<Record<string, unknown>>,
    helm_lifting_soreness_maps: [] as Array<Record<string, unknown>>,
    baseball_bodyweight_entries: [] as Array<Record<string, unknown>>,
    // Legacy table seeded ON PURPOSE with a completed-lift row for player-1 —
    // proves the board no longer reads it.
    baseball_lift_sessions: [
      { id: 'legacy-1', team_id: TEAM_ID, player_id: PLAYER_ID, status: 'completed', scheduled_date: recentYmd(1) },
    ],
    helm_lifting_sessions: [] as Array<Record<string, unknown>>,
  };
}

describe('getStrengthGroupsBoard — has_completed_lift/has_incomplete_lift read helm_lifting_sessions, not legacy', () => {
  it('shows no lift activity when only the legacy baseball_lift_sessions table has a row', async () => {
    const tables = baseTables(); // legacy has a completed session; helm is empty
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const board = await getStrengthGroupsBoard(TEAM_ID);

    const player1 = board.roster.find((p) => p.player_id === PLAYER_ID);
    expect(player1?.has_completed_lift).toBe(false);
    expect(player1?.has_incomplete_lift).toBe(false);
  });

  it('reflects real completed/incomplete lift status from helm_lifting_sessions', async () => {
    const tables = baseTables();
    tables.helm_lifting_sessions = [
      { id: 'helm-1', organization_id: ORG_ID, athlete_id: ATHLETE_ID, status: 'completed', scheduled_date: recentYmd(1) },
      { id: 'helm-2', organization_id: ORG_ID, athlete_id: ATHLETE_2_ID, status: 'missed', scheduled_date: recentYmd(2) },
    ];
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const board = await getStrengthGroupsBoard(TEAM_ID);

    const player1 = board.roster.find((p) => p.player_id === PLAYER_ID);
    const player2 = board.roster.find((p) => p.player_id === PLAYER_2_ID);
    expect(player1?.has_completed_lift).toBe(true);
    expect(player1?.has_incomplete_lift).toBe(false);
    expect(player2?.has_completed_lift).toBe(false);
    expect(player2?.has_incomplete_lift).toBe(true);
  });
});
