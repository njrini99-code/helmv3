/**
 * Contract test for create_goal_for_player (chat goal-creation tool).
 *
 * Prior shipped version had four production bugs that the test suite
 * missed because nothing exercised the DB path:
 *   1. team_id omitted (RLS goals_coach_create requires it)
 *   2. window_days written (it's a GENERATED ALWAYS column)
 *   3. origin: 'chat' (violates golf_goals_origin_check enum)
 *   4. no membership lookup, so a non-team player would also fail later
 *
 * This file pins the exact insert payload shape so any of those four
 * regress as a unit-test failure instead of a silent prod break.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create_goal_for_player } from '@/lib/coachhelm/v3/chat/tools';

const COACH_ID = '22222222-2222-4222-9222-222222222222';
const PLAYER_ID = '33333333-3333-4333-9333-333333333333';
const TEAM_ID = '44444444-4444-4444-9444-444444444444';
const USER_ID = '55555555-5555-4555-9555-555555555555';

type CapturedInsert = Record<string, unknown>;

function buildSb(opts: {
  membership: { team_id: string } | null;
  membershipError?: { message: string } | null;
  insertResult?: { data: { id: string } | null; error: { message: string } | null };
  capturedInsertRef?: { value: CapturedInsert | null };
}) {
  const insertBuilder = {
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(
      opts.insertResult ?? { data: { id: 'new-goal-id' }, error: null },
    ),
  };
  const insert = vi.fn((payload: CapturedInsert) => {
    if (opts.capturedInsertRef) opts.capturedInsertRef.value = payload;
    return insertBuilder;
  });

  const membershipBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.membership,
      error: opts.membershipError ?? null,
    }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'golf_team_members') return membershipBuilder;
      if (table === 'golf_goals') return { insert };
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

describe('create_goal_for_player insert payload contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes team_id (resolved from player membership)', async () => {
    const captured: { value: CapturedInsert | null } = { value: null };
    const sb = buildSb({ membership: { team_id: TEAM_ID }, capturedInsertRef: captured });

    await create_goal_for_player(
      sb as never,
      {
        player_id: PLAYER_ID,
        metric_id: 'sg_putting',
        title: 'Improve lag putting',
        target_value: 0.25,
        window_days: 30,
        coach_assignment_mode: 'suggested',
      },
      USER_ID,
      COACH_ID,
    );

    expect(captured.value).not.toBeNull();
    expect(captured.value).toMatchObject({ team_id: TEAM_ID });
  });

  it('does NOT write window_days (it is a GENERATED ALWAYS column)', async () => {
    const captured: { value: CapturedInsert | null } = { value: null };
    const sb = buildSb({ membership: { team_id: TEAM_ID }, capturedInsertRef: captured });

    await create_goal_for_player(
      sb as never,
      {
        player_id: PLAYER_ID,
        metric_id: 'sg_putting',
        title: 'Improve lag putting',
        target_value: 0.25,
        window_days: 30,
        coach_assignment_mode: 'suggested',
      },
      USER_ID,
      COACH_ID,
    );

    expect(captured.value).not.toHaveProperty('window_days');
  });

  it('uses origin from the constraint-allowed enum (manual/engine_suggested/from_insight)', async () => {
    const captured: { value: CapturedInsert | null } = { value: null };
    const sb = buildSb({ membership: { team_id: TEAM_ID }, capturedInsertRef: captured });

    await create_goal_for_player(
      sb as never,
      {
        player_id: PLAYER_ID,
        metric_id: 'sg_putting',
        title: 'Improve lag putting',
        target_value: 0.25,
        window_days: 30,
        coach_assignment_mode: 'suggested',
      },
      USER_ID,
      COACH_ID,
    );

    expect(['manual', 'engine_suggested', 'from_insight']).toContain(captured.value?.origin);
  });

  it('sets coach attribution fields (creator_role, coach_id_if_assigned, created_by_user_id)', async () => {
    const captured: { value: CapturedInsert | null } = { value: null };
    const sb = buildSb({ membership: { team_id: TEAM_ID }, capturedInsertRef: captured });

    await create_goal_for_player(
      sb as never,
      {
        player_id: PLAYER_ID,
        metric_id: 'sg_putting',
        title: 'Improve lag putting',
        target_value: 0.25,
        window_days: 30,
        coach_assignment_mode: 'suggested',
      },
      USER_ID,
      COACH_ID,
    );

    expect(captured.value).toMatchObject({
      creator_role: 'coach',
      coach_id_if_assigned: COACH_ID,
      created_by_user_id: USER_ID,
    });
  });

  it('returns a clear error if the player has no active team membership', async () => {
    const sb = buildSb({ membership: null });

    const result = await create_goal_for_player(
      sb as never,
      {
        player_id: PLAYER_ID,
        metric_id: 'sg_putting',
        title: 'Improve lag putting',
        target_value: 0.25,
        window_days: 30,
        coach_assignment_mode: 'suggested',
      },
      USER_ID,
      COACH_ID,
    );

    expect(result).toHaveProperty('error');
    expect(String((result as { error?: string }).error)).toMatch(/active team/i);
  });

  it('returns the new goal_id on success', async () => {
    const sb = buildSb({ membership: { team_id: TEAM_ID } });

    const result = await create_goal_for_player(
      sb as never,
      {
        player_id: PLAYER_ID,
        metric_id: 'sg_putting',
        title: 'Improve lag putting',
        target_value: 0.25,
        window_days: 30,
        coach_assignment_mode: 'suggested',
      },
      USER_ID,
      COACH_ID,
    );

    expect(result).toEqual({ goal_id: 'new-goal-id' });
  });
});
