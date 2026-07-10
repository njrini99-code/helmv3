/**
 * W32 follow-up — notifyPlayersOfSelectionOutcome unit test.
 *
 * confirmSelection used to be silent for players: no notification of any
 * kind fired when a coach committed the travel roster. This verifies the
 * fan-out this fix adds — every candidate with a resolvable user gets
 * exactly one email + one push call through the EXISTING notify helpers,
 * and the outcome ('selected' vs 'not_selected') is derived from the
 * COMMITTED golf_qualifier_selections rows, not the workspace snapshot.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { QualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/types';

type Sb = SupabaseClient<Database>;

const emailCalls: Array<{ type: string; userId: string; data: Record<string, unknown> }> = [];
const pushCalls: Array<{ type: string; userId: string; data: Record<string, unknown> }> = [];

vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: vi.fn(
    async (type: string, userId: string, _email: string, data: Record<string, unknown>) => {
      emailCalls.push({ type, userId, data });
      return { success: true };
    },
  ),
}));

vi.mock('@/lib/notifications/push', () => ({
  sendPushNotification: vi.fn(async (type: string, userId: string, data: Record<string, unknown>) => {
    pushCalls.push({ type, userId, data });
    return { success: true };
  }),
}));

import { notifyPlayersOfSelectionOutcome } from '@/lib/coachhelm/v3/qualifying/player-notify';

function workspace(): QualifyingWorkspace {
  return {
    qualifier_id: 'q1',
    team_id: 't1',
    name: 'Spring Qualifier',
    start_date: '2026-05-20',
    end_date: null,
    status: 'in_progress',
    selection_state: 'selected',
    selection_slots_total: 2,
    selection_slots_coach_pick: 1,
    target_tournament_id: null,
    coach_picks_complete: true,
    candidates: [
      {
        player_id: 'p1',
        player_first_name: 'Alice',
        player_last_name: 'Smith',
        rounds_completed: 4,
        total_score: 275,
        total_to_par: -5,
        leaderboard_rank: 1,
        selection: null,
        is_top_score_slot: true,
      },
      {
        player_id: 'p2',
        player_first_name: 'Bob',
        player_last_name: 'Jones',
        rounds_completed: 4,
        total_score: 300,
        total_to_par: 8,
        leaderboard_rank: 3,
        selection: null,
        is_top_score_slot: false,
      },
    ],
  };
}

function buildFakeSb() {
  return createFakeSupabase({
    tables: {
      golf_players: [
        { id: 'p1', user_id: 'u1' },
        { id: 'p2', user_id: 'u2' },
      ],
      users: [
        { id: 'u1', email: 'alice@example.com' },
        { id: 'u2', email: 'bob@example.com' },
      ],
      // Only p1 was actually committed as a selection — p2 was NOT selected.
      golf_qualifier_selections: [
        { qualifier_id: 'q1', player_id: 'p1', selection_type: 'top_score' },
      ],
    },
  }) as unknown as Sb;
}

describe('notifyPlayersOfSelectionOutcome', () => {
  beforeEach(() => {
    emailCalls.length = 0;
    pushCalls.length = 0;
  });

  it('notifies the selected candidate with outcome=selected', async () => {
    await notifyPlayersOfSelectionOutcome(buildFakeSb(), workspace());

    const aliceEmail = emailCalls.find((c) => c.userId === 'u1');
    const alicePush = pushCalls.find((c) => c.userId === 'u1');
    expect(aliceEmail?.data.outcome).toBe('selected');
    expect(alicePush?.data.outcome).toBe('selected');
  });

  it('notifies the non-selected candidate with outcome=not_selected', async () => {
    await notifyPlayersOfSelectionOutcome(buildFakeSb(), workspace());

    const bobEmail = emailCalls.find((c) => c.userId === 'u2');
    const bobPush = pushCalls.find((c) => c.userId === 'u2');
    expect(bobEmail?.data.outcome).toBe('not_selected');
    expect(bobPush?.data.outcome).toBe('not_selected');
  });

  it('is a no-op when there are no candidates', async () => {
    const ws = { ...workspace(), candidates: [] };
    await notifyPlayersOfSelectionOutcome(buildFakeSb(), ws);
    expect(emailCalls).toHaveLength(0);
    expect(pushCalls).toHaveLength(0);
  });
});
