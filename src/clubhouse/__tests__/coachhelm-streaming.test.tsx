import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { landedRead, pulseLanded } from './coachhelm-pulse';
import { resolved } from './route-view';

/**
 * CoachHelm (P013), owner rule 6 (2026-10-01): the board frame and the top card first, the program pulse (the longest read on the
 * page, and one card's worth) streams in its own Suspense beside them, in a card that holds its place (CH-13405). The delivery actions
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
vi.mock('@/app/golf/actions/insights', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
const delivery = vi.hoisted(() => ({ feed: vi.fn(), heads: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: delivery.feed, getTopInsightsForPlayers: delivery.heads }));
const gates = vi.hoisted(() => ({ coach: vi.fn(), player: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: gates.coach, isCoachHelmEnabledForPlayer: gates.player }));
const pulseRead = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: pulseRead.read }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));
vi.mock('../data/coachhelm-chat', () => ({ loadAskCoachHelm: vi.fn() }));

import { loadCoachCoachHelm } from '../data/coachhelm';
import type { ChPulseResult } from '../data/coachhelm-shape';
import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { HELM_PLAYERS, PREVIEW_HELM_COACH, penalties, slope } from '../preview/fixtures-coachhelm';
import { ToastProvider } from '../ui/Toast';

const jonah = HELM_PLAYERS.jonah;
const eli = HELM_PLAYERS.eli;
const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const pulseOf = (items: unknown[]) => ({ items, latest_round_at: null, players_without_rounds: 0, players_with_recent_rounds: 2, recent_window_days: 30, active_roster: 2, as_of: '2026-10-14T12:00:00Z' });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const arrange = () => {
  gates.coach.mockResolvedValue({ ...on });
  delivery.heads.mockResolvedValue(
    new Map([
      [jonah.id, [slope(jonah.id)]],
      [eli.id, [penalties(eli.id, 'in-pen-eli')]],
    ]),
  );
  pulseRead.read.mockResolvedValue(pulseOf([{ id: 'movement-decline', headline: '2 players are scoring higher than their previous three rounds', evidence: 'Jonah Okafor +2.1', tone: 'attention', weight: 80 }]));
  tables.current = {
    golf_team_members: { data: [{ player_id: jonah.id }, { player_id: eli.id }] },
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
  it('CH-13405 the frame, the players and the top card are on screen with the pulse card holding its place; the rows land in that same place', async () => {
    const later = deferred<ChPulseResult>();
    await act(async () => {
      render(wrap(<CoachBoard data={{ ...PREVIEW_HELM_COACH, pulse: later.promise }} />));
    });
    // The top card first.
    expect(document.querySelector('.ch-hl-focus')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'CoachHelm' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'By player' })).toBeInTheDocument();
    // The pulse's card is there, at its reserved place, with its skeleton (never "nothing is flagged", never zero).
    const slot = document.querySelector('.ch-hl-pulse__slot');
    expect(slot).not.toBeNull();
    expect(code('CH-13405')).not.toBeNull();
    expect(code('CH-13405')?.getAttribute('aria-busy')).toBe('true');
    expect(slot?.contains(code('CH-13405'))).toBe(true);
    expect(code('CH-13309')).toBeNull();
    expect(code('CH-13203')).toBeNull();

    await act(async () => {
      later.resolve({ status: 'ok', pulse: PREVIEW_HELM_COACH.pulse as never });
    });
    expect(code('CH-13405')).toBeNull();
    // The same slot, now holding the rows: the card did not move.
    expect(document.querySelector('.ch-hl-pulse__slot')).toBe(slot);
    expect(slot?.querySelectorAll('li').length).toBeGreaterThan(0);
  });

  it('CH-13405 a pulse that is already here draws no skeleton at all', () => {
    render(wrap(<CoachBoard data={{ ...PREVIEW_HELM_COACH, pulse: landedRead<ChPulseResult>({ status: 'ok', pulse: { rows: [], error: false } }) }} />));
    expect(code('CH-13405')).toBeNull();
    expect(code('CH-13309')).not.toBeNull();
  });

  it('CH-13203 a pulse that failed lands as its own notice in the same place, and the players are not affected', async () => {
    const later = deferred<ChPulseResult>();
    await act(async () => {
      render(wrap(<CoachBoard data={{ ...PREVIEW_HELM_COACH, pulse: later.promise }} />));
    });
    await act(async () => {
      later.resolve({ status: 'failed' });
    });
    expect(code('CH-13203')).not.toBeNull();
    expect(code('CH-13309')).toBeNull();
    expect(document.querySelector('.ch-hl-pulse__slot')?.contains(code('CH-13203'))).toBe(true);
    expect(document.querySelector('.ch-hl-focus')).not.toBeNull();
  });

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

  it('a render reads the top insights once, after the gate answered, and streaming the pulse adds no read', async () => {
    const screenEl = await route();
    expect(gates.coach).toHaveBeenCalledTimes(1);
    expect(delivery.heads).toHaveBeenCalledTimes(1);
    expect(gates.coach.mock.invocationCallOrder[0]).toBeLessThan(delivery.heads.mock.invocationCallOrder[0]!);
    await act(async () => {
      render(wrap(screenEl as React.ReactElement));
    });
    // The pulse landed and the board drew it: nothing was read again.
    expect(code('CH-13405')).toBeNull();
    expect(delivery.heads).toHaveBeenCalledTimes(1);
    expect(pulseRead.read).toHaveBeenCalledTimes(1);
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
