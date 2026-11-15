
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pulseLanded } from './coachhelm-pulse';
import { resolved } from './route-view';

/**
 * CoachHelm (P013), owner rule 6 (2026-10-01): the board frame and the top card first, the program pulse (the longest read on the
 * page, and one card's worth) streams in its own Suspense beside them, in the header line, which holds its place (CH-13405). The delivery actions
 * record every insight they return as shown, so each still runs exactly once per render, after the gate, and the stream adds none.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
const delivery = vi.hoisted(() => ({ feed: vi.fn(), heads: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: delivery.feed, getTopInsightsForPlayers: delivery.heads }));
const gates = vi.hoisted(() => ({ coach: vi.fn(), player: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: gates.coach, isCoachHelmEnabledForPlayer: gates.player }));
const pulseRead = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: pulseRead.read, getCoachChatContext: async () => ({ roster: [] }) }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));
vi.mock('../data/coachhelm-chat', () => ({ loadAskCoachHelm: vi.fn() }));

import { loadCoachCoachHelm } from '../data/coachhelm';
import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';
import { HELM_PLAYERS, penalties, slope } from '../preview/fixtures-coachhelm';

const jonah = HELM_PLAYERS.jonah;
const eli = HELM_PLAYERS.eli;
const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
const pulseOf = (items: unknown[]) => ({ items, latest_round_at: null, players_without_rounds: 0, players_with_recent_rounds: 2, recent_window_days: 30, active_roster: 2, as_of: '2026-10-14T12:00:00Z' });

const arrange = () => {
  gates.coach.mockResolvedValue({ ...on });
  delivery.heads.mockResolvedValue(
    new Map([
      [jonah.id, [slope(jonah.id)]],
      [eli.id, [penalties(eli.id, 'in-pen-eli')]],
    ]),
  );
  pulseRead.read.mockResolvedValue(pulseOf([{ id: 'movement-decline', headline: '2 players are scoring worse over their last three rounds', evidence: 'Jonah Okafor +2.1', tone: 'attention', weight: 80 }]));
  tables.current = {
    // The roster is one read: each member row carries the player it names.
    golf_team_members: {
      data: [
        { player_id: jonah.id, player: { id: jonah.id, first_name: 'Jonah', last_name: 'Okafor', graduation_year: null } },
        { player_id: eli.id, player: { id: eli.id, first_name: 'Eli', last_name: 'Brandt', graduation_year: null } },
      ],
    },
    golf_players: {
      data: [
        { id: eli.id, first_name: 'Eli', last_name: 'Brandt' },
        { id: jonah.id, first_name: 'Jonah', last_name: 'Okafor' },
      ],
    },
    golf_coach_insights: { data: [slope(jonah.id), penalties(eli.id, 'in-pen-eli')] },
    golf_drills: { data: [] },
    golf_player_focus_areas: { data: [] },
    golf_teams: { data: { gender: 'mens' } },
    golf_pga_standards: { data: [] },
    golf_rounds: { data: [] },
  } as typeof tables.current;
};

beforeEach(() => {
  logServer.mockClear();
  for (const m of [delivery.feed, delivery.heads, gates.coach, gates.player, pulseRead.read]) m.mockReset();
  arrange();
});
afterEach(() => {
  cleanup();
  tables.current = {};
  session.current = null;
  teamOf.current = null;
});

describe('the coach’s board while the pulse is still on its way', () => {

  it('a pulse read that throws is the pulse failing (logged), never a page that throws or an unhandled rejection', async () => {
    pulseRead.read.mockRejectedValue(new Error('pulse chain down'));
    const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
    expect(d.players.list).toHaveLength(2);
    expect(await pulseLanded(d)).toEqual({ rows: [], error: true });
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'pulse', expect.any(Error), 'coachhelm');
  });

  it('the early returns hand the pulse over still on its way too (a roster that did not read does not wait for it)', async () => {
    tables.current = { ...tables.current, golf_team_members: { error: { message: 'boom' } } };
    const never = new Promise(() => {});
    pulseRead.read.mockReturnValue(never);
    const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
    expect(d.roster).toEqual({ count: 0, error: true });
    expect(typeof (d.pulse as { then?: unknown }).then).toBe('function');
  });
});

describe('the delivery actions, once per render, after the gate', () => {
  const route = async () => {
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1', organization_id: 'o1' }, player: null };
    teamOf.current = { role: 'coach', coachId: 'c1', teamId: 't1' };
    return resolved(await ClubhouseCoachHelmRoute({}));
  };

  // The loader is what is counted (one call of the route is one render's reads); what the board does with the handed-over element
  // afterwards reads nothing, so a count taken after drawing an element that is already resolved would be true by construction.
  it('a render reads the top insights once, after the gate answered, and starts the pulse once, also after it', async () => {
    await route();
    expect(gates.coach).toHaveBeenCalledTimes(1);
    expect(delivery.heads).toHaveBeenCalledTimes(1);
    expect(pulseRead.read).toHaveBeenCalledTimes(1);
    const gateAt = gates.coach.mock.invocationCallOrder[0]!;
    expect(gateAt).toBeLessThan(delivery.heads.mock.invocationCallOrder[0]!);
    expect(gateAt).toBeLessThan(pulseRead.read.mock.invocationCallOrder[0]!);
  });

  it('every render is its own: two renders read the top insights twice, not once and not four times', async () => {
    await route();
    cleanup();
    await route();
    expect(gates.coach).toHaveBeenCalledTimes(2);
    expect(delivery.heads).toHaveBeenCalledTimes(2);
  });

  it('a board that is off reads no insight and starts no pulse', async () => {
    gates.coach.mockResolvedValue({ ...on, teamEnabled: false, effectivelyEnabled: false, disabledBy: 'team', disabledReason: 'Summer break' });
    await route();
    expect(delivery.heads).not.toHaveBeenCalled();
    expect(pulseRead.read).not.toHaveBeenCalled();
  });
});
