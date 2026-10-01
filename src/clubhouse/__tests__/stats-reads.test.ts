import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readWaves } from './read-waves';

/**
 * Stats' reads (perf, 2026-10-01): how many round trips deep the player profile goes, and who the shot-level actions answer to. Figures,
 * states and the read set are in stats-player.test.tsx and stats-parity.test.tsx.
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const probe = vi.hoisted(() => ({
  gate: undefined as undefined | ((n: string) => Promise<void>),
  /** The player each shot-level action saw as the shared context's, or undefined when it ran with no context (and would check for itself). */
  context: [] as Array<string | undefined>,
  session: { user: { id: 'u1' } as { id: string } | null, degraded: false },
  access: { allowed: true },
}));
vi.mock('@/lib/auth/session', () => ({ getGolfAuthUser: async () => probe.session }));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: async () => {
    await probe.gate?.('auth:verifyAccess');
    return { ...probe.access, reason: 'coach' };
  },
}));
vi.mock('@/app/golf/actions/stats-data', async () => {
  const { getStatsActionContext } = await import('@/lib/golf/stats-action-context');
  return {
    getDetailedStats: vi.fn(async () => {
      probe.context.push(getStatsActionContext()?.requestedPlayerId);
      await probe.gate?.('action:getDetailedStats');
      return null;
    }),
    getSprayChartData: vi.fn(async () => {
      probe.context.push(getStatsActionContext()?.requestedPlayerId);
      await probe.gate?.('action:getSprayChartData');
      return { driving: { plottedShots: 0, summaryBands: [] }, approach: { plottedShots: 0, summaryBands: [] } };
    }),
  };
});

import { loadPlayerProfile } from '../data/stats-player';
import { filterFor } from '../data/stats-filter';

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const round = (i: number, player: string) => ({
  id: `r${i}`, player_id: player, round_date: day(i + 1), total_score: 74 + (i % 5), score_to_par: 2 + (i % 5), front_nine: 37, back_nine: 37 + (i % 5), holes_played: 18, status: 'completed',
  round_type: 'practice', course_name: 'Pines', tees_played: 'White', total_putts: 31, total_gir: 10, total_gir_possible: 18, strokes_gained_total: 0.5,
});
const rounds = Array.from({ length: 24 }, (_, i) => round(i, i % 2 ? 'p1' : 'p2'));

function base(over: import('./supabase-fake').ChFakeTables = {}): import('./supabase-fake').ChFakeTables {
  return {
    golf_teams: { data: { name: 'Varsity', gender: 'men' } },
    golf_team_members: (f) => (f.some(([k, a]) => k === 'select' && String(a[0]).includes('player_id')) ? { data: [{ player_id: 'p1' }, { player_id: 'p2' }] } : { data: { status: 'active' } }),
    golf_players: { data: { id: 'p1', first_name: 'Ada', last_name: 'Lin', graduation_year: 2027, handicap_index: 3.1 } },
    golf_rounds: { data: rounds },
    golf_round_stats_cache: { data: rounds.map((r) => ({ round_id: r.id, greens_hit: 10, greens_total: 18, total_putts: 31, birdies: 2, eagles: 0 })) },
    golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] },
    golf_shots: { data: [] },
    golf_holes: { data: [] },
    golf_player_focus_areas: { data: [] },
    golf_goals: { data: [] },
    ...over,
  };
}

beforeEach(() => {
  probe.context = [];
  probe.session = { user: { id: 'u1' }, degraded: false };
  probe.access = { allowed: true };
});

afterEach(() => {
  tables.current = {};
  tables.gate = undefined;
  probe.gate = undefined;
});

async function depthOf(viewer: 'coach' | 'player', over: import('./supabase-fake').ChFakeTables = {}) {
  const waves = readWaves();
  tables.gate = waves.gate;
  probe.gate = waves.gate;
  tables.current = base(over);
  return waves.run(loadPlayerProfile({ viewer, teamId: 't1', playerId: 'p1', window: 'last10', filter: filterFor('last10') }));
}

describe('Stats player reads: how deep', () => {
  it('player: the first round trip holds the player, team, membership, rounds, focus areas, goals and the access check; the shot-level reads and both actions begin in the second (two, not three)', async () => {
    const { result, waves: depth } = await depthOf('player');
    expect(depth).toEqual([
      ['auth:verifyAccess', 'golf_goals', 'golf_player_focus_areas', 'golf_players', 'golf_rounds', 'golf_team_members', 'golf_teams'],
      ['action:getDetailedStats', 'action:getSprayChartData', 'golf_holes', 'golf_pga_standards', 'golf_round_stats_cache', 'golf_shots', 'golf_shots'],
    ]);
    expect(result!.rounds.length).toBeGreaterThan(0);
    // Both actions ran inside the one shared context for this player, so neither signs the viewer in or checks access again.
    expect(probe.context).toEqual(['p1', 'p1']);
  });

  it('coach: the same, with the team list in the first and the teammates’ rounds in the second; only their round figures (the comparison column) come third, beside nothing the page waits on', async () => {
    const { result, waves: depth } = await depthOf('coach');
    expect(depth).toEqual([
      ['auth:verifyAccess', 'golf_goals', 'golf_player_focus_areas', 'golf_players', 'golf_rounds', 'golf_team_members', 'golf_team_members', 'golf_teams'],
      ['action:getDetailedStats', 'action:getSprayChartData', 'golf_holes', 'golf_pga_standards', 'golf_round_stats_cache', 'golf_rounds', 'golf_shots', 'golf_shots'],
      ['golf_round_stats_cache'],
    ]);
    expect(result!.teamAvg).not.toBeNull();
    expect(probe.context).toEqual(['p1', 'p1']);
  });

  it('a degraded session, or no access, or no user leaves each action to check for itself, as before', async () => {
    probe.session = { user: { id: 'u1' }, degraded: true };
    await depthOf('player');
    expect(probe.context).toEqual([undefined, undefined]);
    probe.context = [];
    probe.session = { user: { id: 'u1' }, degraded: false };
    probe.access = { allowed: false };
    await depthOf('player');
    expect(probe.context).toEqual([undefined, undefined]);
    probe.context = [];
    probe.access = { allowed: true };
    probe.session = { user: null, degraded: false };
    await depthOf('player');
    expect(probe.context).toEqual([undefined, undefined]);
  });

  it('a profile that is not on this team is not found, and reads no shots: the shot-level reads wait for the membership', async () => {
    const { result, waves: depth } = await depthOf('coach', { golf_team_members: (f) => (f.some(([k, a]) => k === 'select' && String(a[0]).includes('player_id')) ? { data: [{ player_id: 'p2' }] } : { data: null }) });
    expect(result).toBeNull();
    expect(depth.flat().filter((t) => t === 'golf_shots' || t === 'golf_holes' || t.startsWith('action:'))).toEqual([]);
  });

  it('a teammate’s rounds read that fails fails the rounds, as one combined read did: flagged, no rounds, and none of the shot-level figures', async () => {
    const teammates = (f: Array<[string, unknown[]]>) => {
      const ids = f.find(([k, a]) => k === 'in' && a[0] === 'player_id')?.[1][1] as string[] | undefined;
      return ids?.includes('p2') ? { error: { message: 'boom' } } : { data: rounds };
    };
    const { result } = await depthOf('coach', { golf_rounds: teammates });
    expect(result!.roundsError).toBe(true);
    expect(result!.rounds).toEqual([]);
    expect(result!.stats).toBeNull();
    expect(result!.cacheError).toBe(false);
  });
});
