import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readWaves } from '../../__tests__/read-waves';
import { HELM_PLAYERS, penalties, slope } from '../../preview/fixtures-coachhelm';

/**
 * The coach's CoachHelm Team board loader (`loadCoachTeamBoard`), by the rounds it reads in (perf, F-0013): each round is a set of reads
 * sent together, and the loader's serial depth is the part of the page's wait that overlapping reads buy back. The gate answers first
 * (an off coach reads nothing else), then everything that needs only the roster's ids starts together, the standings included.
 */

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void> | void) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: vi.fn(), getTopInsightsForPlayers: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForPlayer: vi.fn(), isCoachHelmEnabledForCoach: vi.fn() }));
vi.mock('@/lib/golf/player-signal-settings', () => ({ getPlayerSignalSettings: vi.fn(async () => ({ minHolePlaysForRanking: 3, patternLookbackDays: 90, statsBenchmarkWindowDays: 30, minRoundsForSignal: 5 })) }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn(), getCoachChatContext: vi.fn() }));
const standing = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({ loadPlayersStandingMap: standing.load }));
// The themes are a part the board draws later, never one it waits for: nothing in these tests is about them.
vi.mock('../coachhelm-dive', async (original) => ({ ...(await original<typeof import('../coachhelm-dive')>()), readThemes: vi.fn(async () => null) }));

import { getTopInsightsForPlayers } from '@/app/golf/actions/insight-delivery';
import { isCoachHelmEnabledForCoach } from '@/lib/coachhelm/v2/gate';
import { getCoachChatContext, getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { loadCoachTeamBoard } from '../coachhelm-team';

const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
const jonah = HELM_PLAYERS.jonah;
const eli = HELM_PLAYERS.eli;
const flat = (waves: string[][]) => waves.flat();
const at = (waves: string[][], name: string) => waves.findIndex((w) => w.includes(name));
const NOW = new Date('2026-11-13T15:00:00Z');

function arrange(waves: ReturnType<typeof readWaves>, hold?: (t: string) => Promise<void> | void) {
  tables.gate = (t) => hold?.(t) ?? waves.gate(t);
  vi.mocked(isCoachHelmEnabledForCoach).mockImplementation(async () => {
    await waves.gate('gate');
    return { ...on };
  });
  vi.mocked(getCoachChatContext).mockImplementation(async () => {
    await waves.gate('pulse-context');
    return { roster: [] } as never;
  });
  vi.mocked(getCoachProgramPulse).mockImplementation(async () => {
    await waves.gate('pulse');
    return { items: [], latest_round_at: null, players_without_rounds: 0, players_with_recent_rounds: 2, recent_window_days: 30, active_roster: 2, as_of: '2026-11-13T12:00:00Z' };
  });
  vi.mocked(getTopInsightsForPlayers).mockImplementation(async () => {
    await waves.gate('heads');
    return new Map([
      [jonah.id, [slope(jonah.id)]],
      [eli.id, [penalties(eli.id, 'in-pen-eli')]],
    ]);
  });
  standing.load.mockImplementation(async (ids: string[]) => {
    await waves.gate('standing');
    return new Map(ids.map((id) => [id, new Map()]));
  });
  const jonahRow = { id: jonah.id, first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2027 };
  const eliRow = { id: eli.id, first_name: 'Eli', last_name: 'Brandt', graduation_year: 2028 };
  tables.current = {
    // The roster in one read: each member row carries the player it names (the answer a separate `golf_players` read also gives).
    golf_team_members: { data: [{ player_id: jonah.id, player: jonahRow }, { player_id: eli.id, player: eliRow }] },
    golf_players: { data: [jonahRow, eliRow] },
    golf_coach_insights: { data: [slope(jonah.id), penalties(eli.id, 'in-pen-eli')] },
    golf_teams: { data: { name: 'Test Copy', gender: 'mens' } },
    golf_team_settings: { data: { timezone: 'America/New_York' } },
    golf_pga_standards: { data: [] },
    golf_drills: { data: [] },
    golf_player_focus_areas: { data: [] },
    golf_rounds: { data: [] },
  };
}

beforeEach(() => {
  vi.mocked(isCoachHelmEnabledForCoach).mockReset();
  vi.mocked(getTopInsightsForPlayers).mockReset();
  vi.mocked(getCoachChatContext).mockReset();
  vi.mocked(getCoachProgramPulse).mockReset();
  standing.load.mockReset();
});
afterEach(() => {
  tables.current = {};
  tables.gate = undefined;
});

describe('F-0013 the coach board loader reads in few, wide rounds', () => {
  it('the gate is asked first, and a gate that says off reads nothing else', async () => {
    const waves = readWaves();
    arrange(waves);
    vi.mocked(isCoachHelmEnabledForCoach).mockImplementation(async () => {
      await waves.gate('gate');
      return { ...on, effectivelyEnabled: false, disabledBy: 'user', disabledReason: 'Off for this coach' };
    });
    const { result, waves: depth } = await waves.run(loadCoachTeamBoard({ coachId: 'c1', teamId: 't1', now: NOW }));
    expect(result.off).toEqual({ by: 'user', reason: 'Off for this coach' });
    expect(depth).toEqual([['gate']]);
    expect(standing.load).not.toHaveBeenCalled();
    expect(getTopInsightsForPlayers).not.toHaveBeenCalled();
  });

  it('the roster is one read: the members carry their players, there is no second round for the names', async () => {
    const waves = readWaves();
    arrange(waves);
    const { result, waves: depth } = await waves.run(loadCoachTeamBoard({ coachId: 'c1', teamId: 't1', now: NOW }));
    expect(result.players.list.map((p) => p.name).sort()).toEqual(['Eli Brandt', 'Jonah Okafor']);
    expect(result.roster).toEqual({ count: 2, error: false });
    expect(flat(depth).filter((r) => r === 'golf_team_members')).toHaveLength(1);
    expect(flat(depth)).not.toContain('golf_players');
  });

  it('everything that needs only the ids starts as soon as the roster answers: the insights, the heads, the rounds and the standings', async () => {
    const waves = readWaves();
    arrange(waves);
    const { waves: depth } = await waves.run(loadCoachTeamBoard({ coachId: 'c1', teamId: 't1', now: NOW }));
    const roster = at(depth, 'golf_team_members');
    expect(depth[0]).toEqual(['gate']);
    expect(roster).toBe(1);
    // The standings are a read of their own that nothing else waits for, so they overlap the insights instead of following the whole board.
    expect(at(depth, 'standing')).toBe(roster + 1);
    expect(at(depth, 'heads')).toBe(roster + 1);
    expect(at(depth, 'golf_coach_insights')).toBe(roster + 1);
    expect(at(depth, 'golf_rounds')).toBe(roster + 1);
    expect(standing.load).toHaveBeenCalledTimes(1);
    expect(getTopInsightsForPlayers).toHaveBeenCalledTimes(1);
  });

  it('a slow timezone read does not hold the insights, the heads or the rounds back: it is needed only to shape the board', async () => {
    const waves = readWaves();
    let release!: () => void;
    const zone = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The zone answers only once the insights read has been sent; a loader that waits for it first would never send that read.
    arrange(waves, (t) => {
      if (t === 'golf_coach_insights') release();
      if (t === 'golf_team_settings') return zone;
      return undefined;
    });
    const { result, waves: depth } = await waves.run(loadCoachTeamBoard({ coachId: 'c1', teamId: 't1', now: NOW }));
    expect(result.players.list).toHaveLength(2);
    expect(flat(depth)).toContain('golf_coach_insights');
  });

  it('one request per kind, however many players, and the exposures are asked for once', async () => {
    const waves = readWaves();
    arrange(waves);
    const { waves: depth } = await waves.run(loadCoachTeamBoard({ coachId: 'c1', teamId: 't1', now: NOW }));
    const reads = flat(depth);
    // The team's row is read once for its name, its tour and the Tour's values alike.
    for (const table of ['golf_team_members', 'golf_teams', 'golf_coach_insights', 'golf_drills']) expect(reads.filter((r) => r === table)).toHaveLength(1);
    expect(getTopInsightsForPlayers).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getTopInsightsForPlayers).mock.calls[0]![0]).toHaveLength(2);
  });

  it('a failed roster read is the board’s own "did not load", and nothing that needs the ids is read', async () => {
    const waves = readWaves();
    arrange(waves);
    tables.current.golf_team_members = { error: { message: 'boom' } };
    const { result, waves: depth } = await waves.run(loadCoachTeamBoard({ coachId: 'c1', teamId: 't1', now: NOW }));
    expect(result.roster).toEqual({ count: 0, error: true });
    expect(standing.load).not.toHaveBeenCalled();
    expect(getTopInsightsForPlayers).not.toHaveBeenCalled();
    expect(flat(depth)).not.toContain('golf_coach_insights');
  });

  it('a failed standings read leaves the Tour comparison undrawn and everything else as it was', async () => {
    const waves = readWaves();
    arrange(waves);
    standing.load.mockImplementation(async () => {
      await waves.gate('standing');
      throw new Error('standing down');
    });
    const { result } = await waves.run(loadCoachTeamBoard({ coachId: 'c1', teamId: 't1', now: NOW }));
    expect(result.course.against).toBeNull();
    expect(result.players.list).toHaveLength(2);
    expect(result.players.error).toBe(false);
  });

  it('the standings come back as the Tour comparison when they load', async () => {
    const waves = readWaves();
    arrange(waves);
    const { result } = await waves.run(loadCoachTeamBoard({ coachId: 'c1', teamId: 't1', now: NOW }));
    expect(result.course.against).toHaveLength(6);
    expect(result.team.name).toBe('Test Copy');
  });
});
