import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

/**
 * CoachHelm (P013) 130804: every write is checked again by its server action, whatever the board shows. These run the real
 * actions the board's writes call (dismissInsight, reactivateInsight, createFocusAreaFromInsightV2) against a fake database,
 * as callers the action must refuse, and assert that nothing was written.
 */

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));
vi.mock('@/lib/flags', () => ({ isFlagEnabled: () => false }));
vi.mock('@/lib/notifications', () => ({ notifyDevPlanAssigned: vi.fn(async () => {}) }));
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', () => ({ recordInsightAction: vi.fn(async () => {}) }));

import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import { createFocusAreaFromInsightV2 } from '@/app/golf/actions/development';
import { dismissInsight, reactivateInsight } from '@/app/golf/actions/insights-feed';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const COACH_USER = 'user-coach';
const OTHER_COACH_USER = 'user-coach-other-team';
const PLAYER_USER = 'user-player';
const OTHER_PLAYER_USER = 'user-player-2';

/**
 * Team 1 is staffed by COACH_USER. The insight belongs to team 1 and to player-1, who is on team 1. `coach_id_for_team`
 * answers a coach id only for a user who staffs that team, and `verify_coach_owns_player` is true only for a coach of the
 * team the player is on, as the database functions are.
 */
function world(callerUserId: string | null, over: { insights?: Row[]; focusAreas?: Row[] } = {}) {
  const tables: Tables = {
    golf_coach_insights: over.insights ?? [{ id: 'in-1', team_id: 'team-1', player_id: 'player-1', status: 'active', dismissed: false, lifecycle_state: 'detected', acknowledged_at: null }],
    golf_players: [
      { id: 'player-1', user_id: PLAYER_USER },
      { id: 'player-2', user_id: OTHER_PLAYER_USER },
    ],
    golf_team_members: [{ player_id: 'player-1', team_id: 'team-1', status: 'active' }],
    golf_team_coach_staff: [{ team_id: 'team-1', coach_id: 'coach-1' }],
    golf_coaches: [{ id: 'coach-1', user_id: COACH_USER, full_name: 'Maya Reyes' }],
    golf_player_focus_areas: over.focusAreas ?? [],
  };
  fake = createFakeSupabase({
    user: callerUserId ? { id: callerUserId } : null,
    tables,
    rpc: {
      coach_id_for_team: async (args) => {
        const a = args as { p_team_id: string; p_user_id: string };
        return { data: a.p_team_id === 'team-1' && a.p_user_id === COACH_USER ? 'coach-1' : null, error: null };
      },
      verify_coach_owns_player: async (args) => {
        const a = args as { p_player_id: string; p_user_id: string };
        return { data: a.p_player_id === 'player-1' && a.p_user_id === COACH_USER, error: null };
      },
    },
  });
  return tables;
}

const insight = (tables: Tables) => tables.golf_coach_insights![0]!;
const untouched = (tables: Tables) => {
  expect(insight(tables)).toMatchObject({ status: 'active', dismissed: false, lifecycle_state: 'detected' });
  expect(insight(tables).dismissed_at).toBeUndefined();
};
const focusArgs = (over: Row = {}) => ({ playerId: 'player-1', insightId: 'in-1', title: 'Downhill putts', description: 'From 4–6 ft', areaType: 'putting', targetMetric: 'putt_slope_downhill_penalty_pct', currentValue: 23, ...over });

beforeEach(() => vi.clearAllMocks());

describe('130804 dismissInsight refuses what the board would never send', () => {
  it('130804 a caller who is not signed in', async () => {
    const tables = world(null);
    expect(await dismissInsight('in-1')).toEqual({ success: false, error: 'Not authenticated' });
    untouched(tables);
  });

  it('130804 a signed-in user who is not a coach of the insight’s team (a player, even the insight’s own)', async () => {
    for (const user of [PLAYER_USER, OTHER_PLAYER_USER]) {
      const tables = world(user);
      const res = await dismissInsight('in-1');
      expect(res.success).toBe(false);
      expect(res.error).not.toBe('Not authenticated');
      untouched(tables);
    }
  });

  it('130804 a coach of another team', async () => {
    const tables = world(OTHER_COACH_USER);
    expect((await dismissInsight('in-1')).success).toBe(false);
    untouched(tables);
  });

  it('130804 an insight with no team is refused, whoever asks', async () => {
    const tables = world(COACH_USER, { insights: [{ id: 'in-1', team_id: null, player_id: 'player-1', status: 'active', dismissed: false, lifecycle_state: 'detected' }] });
    expect((await dismissInsight('in-1')).success).toBe(false);
    untouched(tables);
  });

  it('130804 an insight that does not exist', async () => {
    const tables = world(COACH_USER);
    expect((await dismissInsight('in-nope')).success).toBe(false);
    untouched(tables);
  });

  it('130804 the coach of the insight’s team dismisses it, and only that team’s row changes', async () => {
    const tables = world(COACH_USER, {
      insights: [
        { id: 'in-1', team_id: 'team-1', player_id: 'player-1', status: 'active', dismissed: false, lifecycle_state: 'detected' },
        { id: 'in-1', team_id: 'team-2', player_id: 'player-9', status: 'active', dismissed: false, lifecycle_state: 'detected' },
      ],
    });
    expect(await dismissInsight('in-1')).toEqual({ success: true });
    const [mine, theirs] = tables.golf_coach_insights!;
    expect(mine).toMatchObject({ status: 'dismissed', dismissed: true, lifecycle_state: 'archived' });
    expect(theirs).toMatchObject({ status: 'active', dismissed: false, lifecycle_state: 'detected' });
  });
});

describe('130804 reactivateInsight (Undo) is behind the same gate', () => {
  const dismissed = { id: 'in-1', team_id: 'team-1', player_id: 'player-1', status: 'dismissed', dismissed: true, lifecycle_state: 'archived' };

  it('130804 refuses a caller who is not signed in, a player, a coach of another team and an insight with no team', async () => {
    for (const [user, insights] of [
      [null, undefined],
      [PLAYER_USER, undefined],
      [OTHER_COACH_USER, undefined],
      [COACH_USER, [{ ...dismissed, team_id: null }]],
    ] as const) {
      const tables = world(user, { insights: insights ? [...insights] : [{ ...dismissed }] });
      const res = await reactivateInsight('in-1', 'detected', 'dismiss');
      expect(res.success).toBe(false);
      expect(insight(tables)).toMatchObject({ status: 'dismissed', dismissed: true, lifecycle_state: 'archived' });
    }
  });

  it('130804 the coach of the insight’s team restores it to the state it had', async () => {
    const tables = world(COACH_USER, { insights: [{ ...dismissed }] });
    expect(await reactivateInsight('in-1', 'matured', 'dismiss')).toEqual({ success: true });
    expect(insight(tables)).toMatchObject({ status: 'active', dismissed: false, lifecycle_state: 'matured' });
  });
});

describe('130804 createFocusAreaFromInsightV2 refuses a caller who fails the player check', () => {
  it('130804 not signed in', async () => {
    const tables = world(null);
    expect(await createFocusAreaFromInsightV2(focusArgs())).toEqual({ success: false, error: 'Not authenticated' });
    expect(tables.golf_player_focus_areas).toHaveLength(0);
  });

  it('130804 a coach of another team, and another player', async () => {
    for (const user of [OTHER_COACH_USER, OTHER_PLAYER_USER]) {
      const tables = world(user);
      expect(await createFocusAreaFromInsightV2(focusArgs())).toEqual({ success: false, error: 'Forbidden' });
      expect(tables.golf_player_focus_areas).toHaveLength(0);
    }
  });

  it('130804 a coach of the player’s team makes a proposal the player has to accept', async () => {
    const tables = world(COACH_USER);
    const res = await createFocusAreaFromInsightV2(focusArgs());
    expect(res.success).toBe(true);
    expect(tables.golf_player_focus_areas).toHaveLength(1);
    expect(tables.golf_player_focus_areas![0]).toMatchObject({ player_id: 'player-1', team_id: 'team-1', status: 'proposed', started_at: null, from_insight_id: 'in-1' });
  });

  it('130804 a second active focus on the same metric is refused with the duplicate error, and nothing is added', async () => {
    const tables = world(COACH_USER, { focusAreas: [{ id: 'fa-1', player_id: 'player-1', target_metric: 'putt_slope_downhill_penalty_pct', status: 'active' }] });
    const res = await createFocusAreaFromInsightV2(focusArgs());
    expect(res).toMatchObject({ success: false, error: ACTIVE_FOCUS_DUPLICATE_ERROR, duplicateFocusAreaId: 'fa-1' });
    expect(tables.golf_player_focus_areas).toHaveLength(1);
  });

  it('130804 the player themself passes the check, and their own use makes an active focus with no proposal (not reachable from this board)', async () => {
    const tables = world(PLAYER_USER);
    expect((await createFocusAreaFromInsightV2(focusArgs())).success).toBe(true);
    expect(tables.golf_player_focus_areas![0]).toMatchObject({ player_id: 'player-1', status: 'active' });
    expect(tables.golf_player_focus_areas![0]!.started_at).toEqual(expect.any(String));
  });
});
