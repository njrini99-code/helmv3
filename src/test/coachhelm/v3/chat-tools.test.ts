/**
 * W32-pt2 — input-schema validation for the 10 chat tools.
 *
 * The handlers themselves hit Supabase, so we don't unit-test the DB
 * path. What's worth covering: each tool's zod schema correctly
 * rejects bad input (the agent will send arbitrary args during the
 * tool loop — a malformed args object must not reach the handler).
 */

import { describe, it, expect } from 'vitest';
import {
  GetPlayerContextInput,
  GetPlayerInsightsInput,
  GetPlayerStandingInput,
  GetPlayerRecentRoundsInput,
  ComparePlayersInput,
  GetTeamOverviewInput,
  GetTeamPatternsInput,
  ListPlayerGoalsInput,
  GetGoalDetailsInput,
  CreateGoalForPlayerInput,
} from '@/lib/coachhelm/v3/chat/tools';

// Zod v4 .uuid() validates RFC 4122 strictly: version digit at position 13
// (must be 4 for v4) and variant at position 17 (must be 8/9/a/b).
const UUID = '11111111-1111-4111-9111-111111111111';

describe('chat tool input schemas', () => {
  it('get_player_context: requires uuid player_id', () => {
    expect(GetPlayerContextInput.safeParse({ player_id: UUID }).success).toBe(true);
    expect(GetPlayerContextInput.safeParse({ player_id: 'nope' }).success).toBe(false);
    expect(GetPlayerContextInput.safeParse({}).success).toBe(false);
  });

  it('get_player_insights: category restricted to enum, limit defaults to 5', () => {
    const r = GetPlayerInsightsInput.safeParse({ player_id: UUID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(5);

    expect(
      GetPlayerInsightsInput.safeParse({ player_id: UUID, category: 'putting' }).success,
    ).toBe(true);
    expect(
      GetPlayerInsightsInput.safeParse({ player_id: UUID, category: 'bogus' }).success,
    ).toBe(false);
    expect(
      GetPlayerInsightsInput.safeParse({ player_id: UUID, limit: 99 }).success,
    ).toBe(false);
  });

  it('get_player_standing: metric_id optional', () => {
    expect(GetPlayerStandingInput.safeParse({ player_id: UUID }).success).toBe(true);
    expect(
      GetPlayerStandingInput.safeParse({ player_id: UUID, metric_id: 'sg_putt' }).success,
    ).toBe(true);
  });

  it('get_player_recent_rounds: limit bounded 1-20', () => {
    expect(GetPlayerRecentRoundsInput.safeParse({ player_id: UUID, limit: 0 }).success).toBe(false);
    expect(GetPlayerRecentRoundsInput.safeParse({ player_id: UUID, limit: 25 }).success).toBe(false);
    expect(GetPlayerRecentRoundsInput.safeParse({ player_id: UUID, limit: 10 }).success).toBe(true);
  });

  it('compare_players: requires both ids + metric_id', () => {
    expect(
      ComparePlayersInput.safeParse({ player_a_id: UUID, metric_id: 'sg' }).success,
    ).toBe(false);
    expect(
      ComparePlayersInput.safeParse({
        player_a_id: UUID,
        player_b_id: UUID,
        metric_id: 'sg',
      }).success,
    ).toBe(true);
  });

  it('get_team_overview / get_team_patterns: window_days bounded', () => {
    expect(GetTeamOverviewInput.safeParse({ team_id: UUID }).success).toBe(true);
    expect(GetTeamPatternsInput.safeParse({ team_id: UUID, window_days: 0 }).success).toBe(false);
    expect(GetTeamPatternsInput.safeParse({ team_id: UUID, window_days: 200 }).success).toBe(false);
    expect(GetTeamPatternsInput.safeParse({ team_id: UUID, window_days: 60 }).success).toBe(true);
  });

  it('list_player_goals / get_goal_details: uuid required', () => {
    expect(ListPlayerGoalsInput.safeParse({ player_id: UUID }).success).toBe(true);
    expect(GetGoalDetailsInput.safeParse({ goal_id: UUID }).success).toBe(true);
    expect(GetGoalDetailsInput.safeParse({ goal_id: 'not-a-uuid' }).success).toBe(false);
  });

  it('create_goal_for_player: enforces title length + window range + assignment enum', () => {
    const base = {
      player_id: UUID,
      metric_id: 'putt_distance_3_5ft',
      title: 'Lag putting drill',
      target_value: 85,
      window_days: 30,
    };
    expect(CreateGoalForPlayerInput.safeParse(base).success).toBe(true);
    expect(
      CreateGoalForPlayerInput.safeParse({ ...base, title: '' }).success,
    ).toBe(false);
    expect(
      CreateGoalForPlayerInput.safeParse({ ...base, window_days: 3 }).success,
    ).toBe(false);
    expect(
      CreateGoalForPlayerInput.safeParse({ ...base, window_days: 400 }).success,
    ).toBe(false);
    expect(
      CreateGoalForPlayerInput.safeParse({ ...base, coach_assignment_mode: 'casual' }).success,
    ).toBe(false);
  });

  it('create_goal_for_player: defaults assignment to suggested when omitted', () => {
    const r = CreateGoalForPlayerInput.safeParse({
      player_id: UUID,
      metric_id: 'm',
      title: 't',
      target_value: 1,
      window_days: 30,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.coach_assignment_mode).toBe('suggested');
  });
});
