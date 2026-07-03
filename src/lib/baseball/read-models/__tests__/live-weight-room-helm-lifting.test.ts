// =============================================================================
// Regression test: getLiveWeightRoomData (the flagship Live Weight Room staff
// screen) must read today's materialized sessions + session_exercises +
// set_results from the unified helm_lifting_* tables, not the legacy
// baseball_lift_sessions / _session_exercises / _set_results tables — which
// hold 0 rows for real activity since createLiftAssignment / publishLiftDay /
// logLiftResult write ONLY to helm_lifting_* now (the W2-G rewire). Before
// this fix the flagship screen rendered empty for every real quick-assigned
// lift, per the clean-slate audit.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

import { getLiveWeightRoomData } from '@/lib/baseball/read-models/live-weight-room';

const TEAM_ID = 'team-1';
const ORG_ID = 'org-1';
const PLAYER_ID = 'player-1';
const ATHLETE_ID = 'athlete-1';

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function baseTables() {
  return {
    // The fake-supabase QueryBuilder does not implement embedded-select
    // joins, but it also does not project rows to the select column list —
    // it returns raw seeded rows verbatim, so pre-shaping the nested
    // `baseball_players` object here reproduces exactly what a real
    // `.select('player_id, baseball_players!inner(...)')` would hand back.
    baseball_team_members: [
      {
        team_id: TEAM_ID,
        player_id: PLAYER_ID,
        baseball_players: {
          id: PLAYER_ID,
          user_id: 'user-1',
          first_name: 'Jordan',
          last_name: 'Ríos',
          primary_position: 'SS',
        },
      },
    ],
    baseball_teams: [{ id: TEAM_ID, organization_id: ORG_ID, name: 'Rini U' }],
    helm_lifting_athletes: [
      { id: ATHLETE_ID, organization_id: ORG_ID, sport: 'baseball', sport_player_id: PLAYER_ID },
    ],
    baseball_strength_groups: [] as Array<Record<string, unknown>>,
    baseball_strength_group_members: [] as Array<Record<string, unknown>>,
    // Legacy tables seeded ON PURPOSE with a row for today that satisfies the
    // OLD (pre-rewire) query shape — proves the screen no longer reads them.
    baseball_lift_sessions: [
      { id: 'legacy-sess-1', team_id: TEAM_ID, player_id: PLAYER_ID, status: 'started', scheduled_date: todayYmd(), title: 'Legacy Lift' },
    ],
    baseball_lift_session_exercises: [] as Array<Record<string, unknown>>,
    baseball_lift_set_results: [] as Array<Record<string, unknown>>,
    helm_lifting_sessions: [] as Array<Record<string, unknown>>,
    helm_lifting_session_exercises: [] as Array<Record<string, unknown>>,
    helm_lifting_set_results: [] as Array<Record<string, unknown>>,
  };
}

describe('getLiveWeightRoomData — reads helm_lifting_* (unified), not legacy baseball_lift_*', () => {
  it('renders no athletes when only the legacy tables hold a session for today', async () => {
    const tables = baseTables(); // legacy has a row; helm is empty
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const data = await getLiveWeightRoomData(TEAM_ID, false);

    expect(data.athletes).toHaveLength(0);
    expect(data.top_bar.total).toBe(0);
  });

  it('renders the athlete grid from a real helm_lifting_sessions row for today', async () => {
    const tables = baseTables();
    tables.helm_lifting_sessions = [
      {
        id: 'helm-sess-1',
        organization_id: ORG_ID,
        sport: 'baseball',
        team_id: TEAM_ID,
        athlete_id: ATHLETE_ID,
        status: 'started',
        scheduled_date: todayYmd(),
        title: 'Lower Body',
      },
    ];
    tables.helm_lifting_session_exercises = [
      {
        id: 'helm-se-1',
        session_id: 'helm-sess-1',
        exercise_id: null,
        exercise_name_snapshot: 'Back Squat',
        section_name_snapshot: 'Main',
        section_type_snapshot: 'main_strength',
        order_index: 0,
        prescribed_sets: 3,
        prescribed_reps: 5,
        prescribed_load: 225,
        prescribed_load_unit: 'lb',
        prescribed_rpe: 8,
        modification_reason: null,
        status: 'assigned',
      },
    ];
    tables.helm_lifting_set_results = [
      {
        session_exercise_id: 'helm-se-1',
        set_number: 1,
        prescribed_reps: 5,
        actual_reps: 5,
        prescribed_load: 225,
        actual_load: 225,
        load_unit: 'lb',
        rpe: 8,
        velocity: null,
        coach_observed: false,
        completed_at: new Date().toISOString(),
        player_note: null,
      },
    ];
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const data = await getLiveWeightRoomData(TEAM_ID, false);

    expect(data.top_bar.total).toBe(1);
    expect(data.athletes).toHaveLength(1);
    const athlete = data.athletes[0]!;
    expect(athlete.player_id).toBe(PLAYER_ID);
    expect(athlete.session_id).toBe('helm-sess-1');
    expect(athlete.session_status).toBe('started');
    expect(athlete.total_exercises).toBe(1);
    expect(athlete.exercises[0]?.exercise_name).toBe('Back Squat');
    expect(athlete.exercises[0]?.sets_logged).toBe(1);
    expect(athlete.actual_load).toBe(225);
    expect(athlete.rpe).toBe(8);
  });
});
