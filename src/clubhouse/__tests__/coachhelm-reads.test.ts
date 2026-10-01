import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readWaves } from './read-waves';

/**
 * CoachHelm (P013): how many round trips deep the coach's board and the player's Deep dive read, and what must NOT start early
 * (perf, 2026-10-01). Correctness is in coachhelm.test.tsx and coachhelm-dive.test.tsx. A mocked read joins the count with
 * `waves.gate(name)`, once per hop it stands for (the program pulse is a chain of seven: the chat context is six reads in a row,
 * then one wave of six, `lib/coachhelm/v3/chat/request-cache.ts`).
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const delivery = vi.hoisted(() => ({ feed: vi.fn(), heads: vi.fn(), themes: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: delivery.feed, getTopInsightsForPlayers: delivery.heads, getThemesForPlayer: delivery.themes }));
const goals = vi.hoisted(() => ({ active: vi.fn(), achieved: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: goals.active, loadRecentlyAchievedGoals: goals.achieved }));
const gates = vi.hoisted(() => ({ coach: vi.fn(), player: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: gates.coach, isCoachHelmEnabledForPlayer: gates.player }));
const pulseRead = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: pulseRead.read }));

import { loadCoachCoachHelm } from '../data/coachhelm';
import { loadPlayerDeepDive } from '../data/coachhelm-dive';
import { bigNumber, HELM_PLAYERS, slope } from '../preview/fixtures-coachhelm';

const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
const off = { ...on, teamEnabled: false, effectivelyEnabled: false, disabledBy: 'team', disabledReason: 'Summer break' } as const;
const jonah = HELM_PLAYERS.jonah;
const eli = HELM_PLAYERS.eli;

/** `n` reads one after another, as a chain of that depth. */
const hops = async (waves: ReturnType<typeof readWaves>, name: string, n: number) => {
  for (let i = 0; i < n; i++) await waves.gate(`${name}${i + 1}`);
};

beforeEach(() => {
  for (const m of [delivery.feed, delivery.heads, delivery.themes, goals.active, goals.achieved, gates.coach, gates.player, pulseRead.read]) m.mockReset();
});
afterEach(() => {
  tables.current = {};
  tables.gate = undefined;
});

describe('the coach’s board reads', () => {
  const pulse = { items: [], as_of: '2026-10-14T12:00:00Z', players_with_recent_rounds: 2, active_roster: 2 };
  const insight = (id: string, playerId: string) => ({ ...slope(playerId), id });

  /** The gate takes three reads (the coach, their settings, their teams' settings), the pulse seven. */
  function arrange(waves: ReturnType<typeof readWaves>, gate: unknown = on) {
    tables.gate = waves.gate;
    gates.coach.mockImplementation(async () => {
      await hops(waves, 'gate', 3);
      return gate;
    });
    pulseRead.read.mockImplementation(async () => {
      await hops(waves, 'pulse', 7);
      return pulse;
    });
    delivery.heads.mockImplementation(async () => {
      await waves.gate('heads');
      return new Map([
        [jonah.id, [insight('in-1', jonah.id)]],
        [eli.id, [insight('in-2', eli.id)]],
      ]);
    });
    tables.current = {
      golf_team_members: { data: [{ player_id: jonah.id }, { player_id: eli.id }] },
      golf_players: {
        data: [
          { id: jonah.id, first_name: 'Jonah', last_name: 'Okafor' },
          { id: eli.id, first_name: 'Eli', last_name: 'Brandt' },
        ],
      },
      golf_coach_insights: { data: [insight('in-1', jonah.id), insight('in-2', eli.id)] },
      golf_teams: { data: { gender: 'mens' } },
      golf_pga_standards: { data: [] },
      golf_drills: { data: [] },
      golf_player_focus_areas: { data: [] },
      golf_rounds: { data: [] },
    };
  }

  it('the pulse and the Tour read beside the roster, so the board is as deep as the pulse (the gate, then seven), not the gate, the roster and then the pulse', async () => {
    const waves = readWaves();
    arrange(waves);
    const { result, waves: depth } = await waves.run(loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' }));
    expect(result.players.list).toHaveLength(2);
    // The pulse starts in the wave after the gate, with the roster, not after it. (Before: 3 + 1 + 1 + 7 + 1 = 13 waves.)
    expect(depth.find((w) => w.includes('pulse1'))).toEqual(expect.arrayContaining(['golf_team_members', 'golf_teams']));
    expect(depth.findIndex((w) => w.includes('pulse1'))).toBe(depth.findIndex((w) => w.includes('gate3')) + 1);
    expect(depth).toHaveLength(10);
  });

  it('nothing is read before the gate has answered, and a board that is off reads nothing else (the delivery action records what it returns as shown)', async () => {
    const waves = readWaves();
    arrange(waves, off);
    const { result, waves: depth } = await waves.run(loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' }));
    expect(result.off).toEqual({ by: 'team', reason: 'Summer break' });
    expect(depth).toEqual([['gate1'], ['gate2'], ['gate3']]);
    expect(delivery.heads).not.toHaveBeenCalled();
    expect(pulseRead.read).not.toHaveBeenCalled();
  });

  it('the top insights (the read that records exposure) wait for the roster and are read once', async () => {
    const waves = readWaves();
    arrange(waves);
    const { waves: depth } = await waves.run(loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' }));
    expect(delivery.heads).toHaveBeenCalledTimes(1);
    const at = (name: string) => depth.findIndex((w) => w.includes(name));
    expect(at('heads')).toBeGreaterThan(at('golf_players'));
    expect(at('golf_players')).toBeGreaterThan(at('golf_team_members'));
  });
});

describe('the Deep dive reads', () => {
  const FEED_HOPS = 3;
  const THEME_HOPS = 5;
  function arrange(waves: ReturnType<typeof readWaves>) {
    tables.gate = waves.gate;
    delivery.feed.mockImplementation(async () => {
      await hops(waves, 'feed', FEED_HOPS);
      return [slope(jonah.id), bigNumber(jonah.id, 'in-dbl')];
    });
    delivery.themes.mockImplementation(async () => {
      await hops(waves, 'themes', THEME_HOPS);
      return { success: true, data: { themes: [] } };
    });
    goals.active.mockImplementation(async () => {
      await waves.gate('goals');
      return [];
    });
    goals.achieved.mockResolvedValue([]);
    tables.current = {
      golf_team_members: { data: { team_id: 't1', golf_teams: { gender: 'mens' } } },
      golf_pga_standards: { data: [] },
      golf_drills: { data: [] },
      golf_player_focus_areas: { data: [] },
      golf_rounds: { data: [] },
    };
  }

  it('the team, the plans and the category reads start with the feed, so the dive is as deep as its longest chain (the themes), not the feed, then the team, then the themes', async () => {
    const waves = readWaves();
    arrange(waves);
    const { result, waves: depth } = await waves.run(loadPlayerDeepDive({ playerId: jonah.id }));
    expect(result.status).toBe('ready');
    // All four start in the first wave. (Before: the feed's 3, the team's 2, then the longest of the rest: 3 + 2 + 5 = 10 waves.)
    expect(depth[0]).toEqual(expect.arrayContaining(['feed1', 'themes1', 'goals', 'golf_team_members']));
    expect(depth).toHaveLength(THEME_HOPS);
  });

  it('the feed (the read that records exposure) is read once, and the rounds behind the insights wait for it', async () => {
    const waves = readWaves();
    arrange(waves);
    const { waves: depth } = await waves.run(loadPlayerDeepDive({ playerId: jonah.id }));
    expect(delivery.feed).toHaveBeenCalledTimes(1);
    expect(delivery.feed).toHaveBeenCalledWith(jonah.id, { limit: 30, drawn: expect.any(Function) });
    const at = (name: string) => depth.findIndex((w) => w.includes(name));
    expect(at('golf_drills')).toBeGreaterThan(at(`feed${FEED_HOPS}`));
  });

  it('a feed that fails leaves the dive failed, with the reads started beside it harmless (nothing unhandled)', async () => {
    const waves = readWaves();
    arrange(waves);
    delivery.feed.mockImplementation(async () => {
      await waves.gate('feed1');
      throw new Error('down');
    });
    delivery.themes.mockRejectedValue(new Error('themes down'));
    const { result } = await waves.run(loadPlayerDeepDive({ playerId: jonah.id }));
    expect(result).toEqual({ status: 'failed' });
  });
});
