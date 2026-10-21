import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Team patterns (Slice 7b) count a player's current findings only, by the predicate the player cards use: a read made out of
 * date by a newer round must not name a player or add strokes (Codex review on #2251).
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const delivery = vi.hoisted(() => ({ feed: vi.fn(), heads: vi.fn(), themes: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: delivery.feed, getTopInsightsForPlayers: delivery.heads, getThemesForPlayer: delivery.themes }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: vi.fn(), loadRecentlyAchievedGoals: vi.fn() }));
const gates = vi.hoisted(() => ({ coach: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: gates.coach, isCoachHelmEnabledForPlayer: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: async () => ({ items: [], as_of: '2026-10-14T12:00:00Z', players_with_recent_rounds: 2, active_roster: 2 }), getCoachChatContext: async () => ({ roster: [] }) }));
vi.mock('@/lib/coachhelm/v3/team-pattern/flag', () => ({ TEAM_PATTERN_FLAG: 'coachhelm_team_pattern_v1', teamPatternEnabled: () => true }));
const compute = vi.hoisted(() => ({ spy: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/team-pattern/pattern', async (orig) => {
  const actual = await orig<typeof import('@/lib/coachhelm/v3/team-pattern/pattern')>();
  compute.spy.mockImplementation(actual.computeTeamPatterns);
  return { ...actual, computeTeamPatterns: compute.spy };
});

import { loadCoachCoachHelm } from '../data/coachhelm';
import { HELM_PLAYERS, slope } from '../preview/fixtures-coachhelm';

const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
const jonah = HELM_PLAYERS.jonah;
const eli = HELM_PLAYERS.eli;
const round = (id: string, playerId: string) => ({ id, player_id: playerId, round_date: '2026-10-10', total_score: 72, front_nine: 36, back_nine: 36, holes_played: 18, total_putts: 30 });

beforeEach(() => {
  compute.spy.mockClear();
  gates.coach.mockResolvedValue(on);
});
afterEach(() => {
  tables.current = {};
});

describe('team patterns read current findings only', () => {
  it('a read refreshed before the player’s newest round is left out of the pattern computation', async () => {
    const fresh = { ...slope(jonah.id, 'in-fresh'), metadata: { last_refreshed_at: '2026-10-12T08:00:00Z' } };
    const stale = { ...slope(eli.id, 'in-stale'), metadata: { last_refreshed_at: '2026-10-01T08:00:00Z' } };
    delivery.heads.mockResolvedValue(
      new Map([
        [jonah.id, [fresh]],
        [eli.id, [stale]],
      ]),
    );
    tables.current = {
      golf_team_members: { data: [{ player_id: jonah.id }, { player_id: eli.id }] },
      golf_players: {
        data: [
          { id: jonah.id, first_name: 'Jonah', last_name: 'Okafor' },
          { id: eli.id, first_name: 'Eli', last_name: 'Brandt' },
        ],
      },
      golf_coach_insights: { data: [fresh, stale] },
      golf_teams: { data: { gender: 'mens' } },
      golf_pga_standards: { data: [] },
      golf_drills: { data: [] },
      golf_player_focus_areas: { data: [] },
      golf_rounds: { data: [round('r1', jonah.id), round('r2', eli.id)] },
    };
    await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
    expect(compute.spy).toHaveBeenCalledTimes(1);
    const reads = (compute.spy.mock.calls[0]![0] as { reads: Array<{ id: string }> }).reads.map((r) => r.id);
    expect(reads).toContain('in-fresh');
    expect(reads).not.toContain('in-stale');
  });
});
