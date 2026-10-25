import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A coach's views of one player (P013, spec A): the scope check that every coach read waits on, and the three loaders that take its
 * scope. The address's id is input only: nothing about the player is read until the check has found them on this coach's own team.
 */

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
const gates = vi.hoisted(() => ({ coach: vi.fn(), player: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: gates.coach, isCoachHelmEnabledForPlayer: gates.player }));
const delivery = vi.hoisted(() => ({ coach: vi.fn(), player: vi.fn(), coachThemes: vi.fn(), playerThemes: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoach: delivery.coach,
  getInsightsForPlayer: delivery.player,
  getTopInsightsForPlayers: vi.fn(),
  getThemesForCoach: delivery.coachThemes,
  getThemesForPlayer: delivery.playerThemes,
}));
// The season table's migration is held: the season read answers `missing` and Standing reads the lifetime map.
const standingRead = vi.hoisted(() => ({ load: vi.fn(), season: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({ loadPlayerStandingMap: standingRead.load, loadPlayerSeasonStandingMap: standingRead.season }));
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({ loadPlayerCohort: vi.fn(async () => ({ gender: 'mens', level: null })) }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: vi.fn(async () => []), loadRecentlyAchievedGoals: vi.fn(async () => []) }));
const genome = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/genome/loader', () => ({ loadGenome: genome.load }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn(), getCoachChatContext: async () => ({ roster: [] }) }));

import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { PLAYER_FEED_LIMIT } from '../coachhelm';
import { loadCoachPlayerDeepDive, loadCoachPlayerGame, loadCoachPlayerScope, loadCoachPlayerStanding, type ChCoachPlayerScope } from '../coachhelm-player';
import { bigNumber, penalties, slope } from '../../preview/fixtures-coachhelm';
import { STANDING_ROWS } from '../../preview/fixtures-coachhelm-views';

const COACH = 'c0000000-0000-4000-8000-000000000001';
const TEAM = 'a0000000-0000-4000-8000-000000000001';
const OTHER_TEAM = 'b0000000-0000-4000-8000-000000000002';
const PID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-21T15:00:00Z');

const on = { effectivelyEnabled: true, disabledBy: null, disabledReason: null };
type Filters = Array<[string, unknown[]]>;
const eqOf = (f: Filters, col: string) => f.find(([k, a]) => k === 'eq' && a[0] === col)?.[1][1];

/** Jonah, active on TEAM only: the membership answers only for that team and that player. */
function onTeam(team = TEAM) {
  return (f: Filters) => (eqOf(f, 'team_id') === team && eqOf(f, 'player_id') === PID && eqOf(f, 'status') === 'active' ? { data: { player_id: PID } } : { data: null });
}

beforeEach(() => {
  logServer.mockClear();
  gates.coach.mockReset().mockResolvedValue(on);
  gates.player.mockReset().mockResolvedValue(on);
  delivery.coach.mockReset().mockResolvedValue([]);
  delivery.player.mockReset().mockResolvedValue([]);
  delivery.coachThemes.mockReset().mockResolvedValue({ success: false, error: 'none' });
  delivery.playerThemes.mockReset();
  standingRead.load.mockReset().mockResolvedValue(new Map());
  standingRead.season.mockReset().mockResolvedValue({ status: 'missing' });
  genome.load.mockReset().mockResolvedValue(null);
  tables.current = {
    golf_team_members: onTeam(),
    golf_players: { data: { id: PID, first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2028 } },
    golf_rounds: { data: { round_date: '2026-10-05' } },
  };
});

async function okScope(): Promise<ChCoachPlayerScope> {
  const r = await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID }, NOW);
  if (r.status !== 'ok') throw new Error(`scope ${r.status}`);
  return r.scope;
}

describe('130807 the scope check: on this coach’s team, or nothing is read', () => {
  it('an active member of this team is in scope, with the header the views draw', async () => {
    const scope = await okScope();
    expect(scope).toMatchObject({ coachId: COACH, teamId: TEAM, playerId: PID, lastRound: '2026-10-05' });
    expect(scope.head).toEqual({ playerId: PID, name: 'Jonah Okafor', first: 'Jonah', line: 'Junior · Last round Oct 5, 16 days ago' });
  });

  it('an id that is not a uuid is "not on your team" with no read at all, not even the gate', async () => {
    const reads = vi.fn(() => ({ data: { player_id: 'x' } }));
    tables.current = { golf_team_members: reads, golf_players: reads, golf_rounds: reads };
    expect(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: 'pl-jonah' })).toEqual({ status: 'not-member' });
    expect(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: "1' or 1=1" })).toEqual({ status: 'not-member' });
    expect(reads).not.toHaveBeenCalled();
    expect(gates.coach).not.toHaveBeenCalled();
  });

  it('a uuid that is not on the team is "not on your team", and nothing about the player is read', async () => {
    const names = vi.fn(() => ({ data: { id: OTHER, first_name: 'Someone' } }));
    tables.current = { ...tables.current, golf_players: names };
    expect(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: OTHER })).toEqual({ status: 'not-member' });
    expect(names).not.toHaveBeenCalled();
    expect(gates.player).not.toHaveBeenCalled();
  });

  it('a player this coach staffs on another team is not in scope on this one', async () => {
    tables.current = { ...tables.current, golf_team_members: onTeam(OTHER_TEAM) };
    expect(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID })).toEqual({ status: 'not-member' });
  });

  it('a membership read that fails is "didn’t load", never "not on your team", and is logged', async () => {
    tables.current = { ...tables.current, golf_team_members: { error: { message: 'boom' } } };
    expect(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID })).toEqual({ status: 'failed' });
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'player.member', expect.anything(), 'coachhelm');
  });

  it('the name or the newest round failing is "didn’t load" too', async () => {
    tables.current = { ...tables.current, golf_players: { error: { message: 'boom' } } };
    expect((await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID })).status).toBe('failed');
    tables.current = { ...tables.current, golf_players: { data: { id: PID, first_name: 'Jonah', last_name: 'Okafor' } }, golf_rounds: { error: { message: 'boom' } } };
    expect((await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID })).status).toBe('failed');
  });

  it('CoachHelm off for the coach is the board’s own answer, before the player is looked up', async () => {
    gates.coach.mockResolvedValue({ effectivelyEnabled: false, disabledBy: 'team', disabledReason: 'Off for spring' });
    const members = vi.fn(onTeam());
    tables.current = { ...tables.current, golf_team_members: members };
    expect(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID })).toEqual({ status: 'coach-off', off: { by: 'team', reason: 'Off for spring' } });
    expect(members).not.toHaveBeenCalled();
  });

  it('CoachHelm off for the player’s team keeps the coach’s reason and the header, and nothing else', async () => {
    gates.player.mockResolvedValue({ effectivelyEnabled: false, disabledBy: 'coach', disabledReason: 'Pausing until the qualifier' });
    const r = await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID }, NOW);
    expect(r).toMatchObject({ status: 'player-off', reason: 'Pausing until the qualifier', head: { first: 'Jonah' } });
  });

  it('a gate lookup that failed is "didn’t load"', async () => {
    gates.coach.mockRejectedValueOnce(new Error('down'));
    expect((await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID })).status).toBe('failed');
    gates.player.mockRejectedValueOnce(new Error('down'));
    expect((await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID })).status).toBe('failed');
  });

  it('the header: the class label, "No rounds posted yet", and "Player" for a player with no name on file', async () => {
    tables.current = { ...tables.current, golf_players: { data: { id: PID, first_name: null, last_name: null, graduation_year: null } }, golf_rounds: { data: null } };
    const r = await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID }, NOW);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.scope.head).toMatchObject({ name: 'Player', first: 'Player', line: 'No rounds posted yet' });
    tables.current = { ...tables.current, golf_players: { data: { id: PID, first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2027 } } };
    const s = await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID }, NOW);
    if (s.status !== 'ok') throw new Error(s.status);
    expect(s.scope.head.line).toBe('Senior · No rounds posted yet');
  });

  it('a raw id, or an object shaped like a scope, is not a scope (the loaders do not compile with one)', () => {
    const fake = { coachId: COACH, teamId: TEAM, playerId: OTHER, head: { playerId: OTHER, name: 'X', first: 'X', line: '' }, lastRound: null };
    // @ts-expect-error a raw id is not a scope
    void (() => loadCoachPlayerStanding({ scope: OTHER }));
    // @ts-expect-error an object shaped like one is not either: only loadCoachPlayerScope makes the brand
    void (() => loadCoachPlayerStanding({ scope: fake }));
    // @ts-expect-error nor does the Deep dive take an id
    void (() => loadCoachPlayerDeepDive({ playerId: OTHER }));
    // @ts-expect-error nor How the player plays (the coach's Game profile, folded into Standing)
    void (() => loadCoachPlayerGame({ scope: { ...fake } }));
    expect(standingRead.load).not.toHaveBeenCalled();
  });
});

describe('the loaders read only the scope’s player', () => {
  const rows = (id: string): PlayerStanding[] => STANDING_ROWS.map((r) => ({ ...r, player_id: id }));

  it('Standing: the scope’s player’s rows only, in the coach’s words, with the open read on each metric that has one', async () => {
    const scope = await okScope();
    standingRead.load.mockResolvedValue(new Map([...rows(PID).slice(0, 14), { ...rows(OTHER)[14]! }].map((r) => [r.metric_id, r])));
    tables.current = {
      ...tables.current,
      golf_player_stats_cache: { data: { rounds_played: 14, scoring_average: 77.2 } },
      // The player's visible reads: an open finding on penalties, a strength on putting, and a row of someone else's on big numbers.
      golf_coach_insights: { data: [penalties(PID), slope(PID), bigNumber(OTHER, 'in-other')] },
    };
    delivery.coach.mockResolvedValue([penalties(PID), slope(PID)]);
    const out = await loadCoachPlayerStanding({ scope });
    expect(standingRead.load).toHaveBeenCalledWith(PID);
    // The ladder's open reads come from the coach feed for this player, never the player's own feed.
    expect(delivery.coach).toHaveBeenCalledWith(COACH, { player_id: PID, limit: PLAYER_FEED_LIMIT, includeMore: true });
    expect(delivery.player).not.toHaveBeenCalled();
    if (out.status !== 'ready') throw new Error(out.status);
    const ids = out.data.groups.flatMap((g) => g.rows.map((r) => r.id));
    // The four parts of the round draw on Where strokes go, not in the groups (#2290); the other ten rows are the groups'.
    expect([...ids, ...out.data.ladder.rows.map((r) => r.id)]).toHaveLength(14);
    expect(ids).not.toContain('big_number_rate');
    expect(out.data.reads).toMatchObject({ penalty_rate_per_round: 'in-pen' });
    expect(Object.values(out.data.reads ?? {})).not.toContain('in-other');
  });

  it('Deep dive: the coach feed for the player (never the player’s feed), and a row of anyone else’s is dropped', async () => {
    const scope = await okScope();
    delivery.coach.mockResolvedValue([penalties(PID), slope(PID), penalties(OTHER, 'in-not-theirs')]);
    const out = await loadCoachPlayerDeepDive({ scope });
    expect(delivery.coach).toHaveBeenCalledWith(COACH, { player_id: PID, limit: PLAYER_FEED_LIMIT, includeMore: true });
    expect(delivery.player).not.toHaveBeenCalled();
    expect(delivery.coachThemes).toHaveBeenCalledWith({ player_id: PID });
    expect(delivery.playerThemes).not.toHaveBeenCalled();
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.data.list.map((i) => i.base.id).sort()).toEqual(['in-pen', 'in-slope']);
  });

  it('Deep dive: an empty coach feed with reads on file is "didn’t load", not a first run', async () => {
    const scope = await okScope();
    tables.current = { ...tables.current, golf_coach_insights: { data: [penalties(PID)] } };
    expect(await loadCoachPlayerDeepDive({ scope })).toEqual({ status: 'failed' });
  });

  it('How the player plays (Standing’s section, once the Game profile): the genome of the scope’s player, in the coach’s words', async () => {
    const scope = await okScope();
    genome.load.mockResolvedValueOnce({ player_id: PID, vector: { back_nine_delta: { value: 0.31, confidence: 0.8, label: 'Fades late' } }, computed_at: '2026-09-30T02:30:00Z', rounds_basis: 7 });
    const out = await loadCoachPlayerGame({ scope }, NOW);
    expect(genome.load).toHaveBeenCalledWith(expect.anything(), PID);
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.data).toMatchObject({ state: 'partial', ready: 1, rounds: 7 });
    expect(out.data.measures.find((m) => m.id === 'back_nine_delta')!.meaning).toBe('Whether scoring holds up over the round.');
  });

  it('How the player plays: a genome read that throws is the section’s failed state, logged', async () => {
    const scope = await okScope();
    genome.load.mockRejectedValueOnce(new Error('boom'));
    expect(await loadCoachPlayerGame({ scope }, NOW)).toEqual({ status: 'failed' });
  });
});
