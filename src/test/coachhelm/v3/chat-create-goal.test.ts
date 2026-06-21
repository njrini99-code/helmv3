/**
 * Contract test for create_goal_for_player (chat goal-PROPOSE tool).
 *
 * SECURITY FIX (F017 / B12-chat-goal-confirm-gate): the chat tool used to
 * write a `golf_goals` row directly inside the agent's tool loop, gated only
 * by the LLM system prompt. A model misfire or a prompt-injected "yes" could
 * therefore create a real goal with no human in the loop.
 *
 * The tool is now PROPOSE-ONLY: it performs NO database write and returns a
 * structured `GoalProposal` the chat UI renders as a Confirm/Cancel card. The
 * actual insert happens only when the coach clicks Confirm (the auth-checked,
 * RLS-gated `createGoal` server action — exercised elsewhere). This file pins
 * that contract so a regression that re-introduces a write inside the tool
 * loop fails as a unit test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create_goal_for_player } from '@/lib/coachhelm/v3/chat/tools';
import { isGoalProposal } from '@/lib/coachhelm/v3/chat/types';

const PLAYER_ID = '33333333-3333-4333-9333-333333333333';
const TEAM_ID = '44444444-4444-4444-9444-444444444444';

const VALID_INPUT = {
  player_id: PLAYER_ID,
  metric_id: 'sg_putting',
  title: 'Improve lag putting',
  target_value: 0.25,
  window_days: 30,
  coach_assignment_mode: 'suggested' as const,
};

function buildSb(opts: {
  player?: { id: string; first_name: string | null; last_name: string | null } | null;
  playerError?: { message: string } | null;
  membership: { team_id: string } | null;
  membershipError?: { message: string } | null;
  /** Set true to fail the test if ANY golf_goals access is attempted. */
  forbidGoalsTable?: boolean;
}) {
  const playerBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data:
        opts.player === undefined
          ? { id: PLAYER_ID, first_name: 'Sam', last_name: 'Rivera' }
          : opts.player,
      error: opts.playerError ?? null,
    }),
  };

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
      if (table === 'golf_players') return playerBuilder;
      if (table === 'golf_team_members') return membershipBuilder;
      if (table === 'golf_goals') {
        // The propose-only tool must NEVER touch golf_goals — any access is a
        // regression that re-opens the original vulnerability.
        throw new Error('REGRESSION: create_goal_for_player must not access golf_goals');
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

describe('create_goal_for_player is propose-only (no DB write)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a structured goal proposal, never a goal_id', async () => {
    const sb = buildSb({ membership: { team_id: TEAM_ID } });

    const result = await create_goal_for_player(sb as never, VALID_INPUT);

    expect(result).not.toHaveProperty('goal_id');
    expect(result).toHaveProperty('proposal');
    const proposal = (result as { proposal: unknown }).proposal;
    expect(isGoalProposal(proposal)).toBe(true);
  });

  it('never reads or writes golf_goals (the load-bearing gate)', async () => {
    const sb = buildSb({ membership: { team_id: TEAM_ID } });

    // buildSb throws if golf_goals is accessed; a clean run proves no write.
    await expect(create_goal_for_player(sb as never, VALID_INPUT)).resolves.toBeDefined();
    const tablesTouched = (sb.from as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(tablesTouched).not.toContain('golf_goals');
  });

  it('carries the resolved team_id forward for the confirm step', async () => {
    const sb = buildSb({ membership: { team_id: TEAM_ID } });

    const result = await create_goal_for_player(sb as never, VALID_INPUT);

    expect(result).toMatchObject({ proposal: { team_id: TEAM_ID } });
  });

  it('echoes the proposed parameters (title, metric, target, window, mode)', async () => {
    const sb = buildSb({ membership: { team_id: TEAM_ID } });

    const result = await create_goal_for_player(sb as never, VALID_INPUT);

    expect(result).toMatchObject({
      proposal: {
        kind: 'create_goal',
        player_id: PLAYER_ID,
        metric_id: 'sg_putting',
        title: 'Improve lag putting',
        target_value: 0.25,
        window_days: 30,
        coach_assignment_mode: 'suggested',
      },
    });
  });

  it('includes the player display name for the card', async () => {
    const sb = buildSb({
      player: { id: PLAYER_ID, first_name: 'Sam', last_name: 'Rivera' },
      membership: { team_id: TEAM_ID },
    });

    const result = await create_goal_for_player(sb as never, VALID_INPUT);

    expect(result).toMatchObject({ proposal: { player_name: 'Sam Rivera' } });
  });

  it('returns a clear error if the player has no active team membership', async () => {
    const sb = buildSb({ membership: null });

    const result = await create_goal_for_player(sb as never, VALID_INPUT);

    expect(result).toHaveProperty('error');
    expect(String((result as { error?: string }).error)).toMatch(/active team/i);
  });

  it('returns a clear error if the player does not exist', async () => {
    const sb = buildSb({ player: null, membership: { team_id: TEAM_ID } });

    const result = await create_goal_for_player(sb as never, VALID_INPUT);

    expect(result).toHaveProperty('error');
    expect(String((result as { error?: string }).error)).toMatch(/not found/i);
  });
});
