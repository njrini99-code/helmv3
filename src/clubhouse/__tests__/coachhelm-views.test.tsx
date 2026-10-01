import { LazyMotion, domAnimation } from 'framer-motion';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The player's CoachHelm views beside the board (P013): the route, who it reads for, the CoachHelm switch, and the sub-navigation.
 * A view reads only for the signed-in player; nothing from the address chooses whose data it is.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/golf/dashboard/coachhelm',
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForPlayer: vi.fn(), isCoachHelmEnabledForCoach: vi.fn() }));
const board = vi.hoisted(() => ({ player: vi.fn(), coach: vi.fn() }));
vi.mock('../data/coachhelm', async (orig) => ({ ...(await orig<typeof import('../data/coachhelm')>()), loadPlayerCoachHelm: board.player, loadCoachCoachHelm: board.coach }));
vi.mock('../data/coachhelm-chat', () => ({ loadAskCoachHelm: vi.fn() }));
const profileRead = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../data/coachhelm-profile', () => ({ loadPlayerProfile: profileRead.load }));
const standingRead = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../data/coachhelm-standing', () => ({ loadPlayerStanding: standingRead.load }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));

import { isCoachHelmEnabledForCoach, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { Profile } from '../screens/coachhelm/views/Profile';
import { ProfileSkeleton, StandingSkeleton } from '../screens/coachhelm/views/Skeletons';
import { Standing } from '../screens/coachhelm/views/Standing';
import { PREVIEW_HELM_PLAYER, PREVIEW_HELM_PLAYER_OFF } from '../preview/fixtures-coachhelm';
import { PREVIEW_PROFILE, PREVIEW_STANDING, profileLoad, standingLoad } from '../preview/fixtures-coachhelm-views';
import { ToastProvider } from '../ui/Toast';

const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
const off = { userEnabled: true, teamEnabled: false, effectivelyEnabled: false, disabledReason: 'Back after the qualifier', disabledBy: 'coach' } as const;
const jonah = { userId: 'u2', role: 'player', coach: null, player: { id: 'pl-jonah' } };
const maya = { userId: 'u1', role: 'coach', coach: { id: 'c1', organization_id: 'org1' }, player: null };

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
type Gated = ReactElement<{ fallback: ReactElement; children: ReactElement<{ playerId: string }> }>;

beforeEach(() => {
  phoneState.on = false;
  hapticSpy.mockClear();
  router.push.mockClear();
  logServer.mockClear();
  profileRead.load.mockReset();
  standingRead.load.mockReset();
  board.player.mockReset();
  board.coach.mockReset();
  vi.mocked(isCoachHelmEnabledForPlayer).mockReset();
  vi.mocked(isCoachHelmEnabledForCoach).mockReset();
  vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...on });
  session.current = jonah;
  teamOf.current = { role: 'player', teamId: 't1', playerId: 'pl-jonah' };
});
afterEach(cleanup);

/** Each of the player's views: its address, its screen, its skeleton and the one loader it calls. */
const VIEWS = [
  { view: 'profile', name: 'Game profile', Screen: Profile, Skeleton: ProfileSkeleton, read: profileRead.load, ready: profileLoad(PREVIEW_PROFILE) },
  { view: 'standing', name: 'Standing', Screen: Standing, Skeleton: StandingSkeleton, read: standingRead.load, ready: standingLoad(PREVIEW_STANDING) },
] as const;
const allReads = () => VIEWS.map((v) => v.read);

describe.each(VIEWS)('?view=$view ($name): the player’s own, behind the same switch as the board', ({ view, Screen, Skeleton, read, ready }) => {
  it('reads for the session’s player and nobody else, whatever the address says, inside a keyed Suspense that draws the view’s own skeleton', async () => {
    const el = (await ClubhouseCoachHelmRoute({ view, player: 'pl-someone-else' })) as Gated;
    expect(isCoachHelmEnabledForPlayer).toHaveBeenCalledWith('pl-jonah');
    expect(el.key).toBe(view);
    expect(el.props.fallback.type).toBe(Skeleton);
    expect(el.props.children.props.playerId).toBe('pl-jonah');
    read.mockResolvedValue(ready);
    const out = (await (el.props.children.type as (p: unknown) => Promise<ReactElement<{ load: unknown }>>)(el.props.children.props)) as ReactElement<{ load: unknown }>;
    expect(read).toHaveBeenCalledWith({ playerId: 'pl-jonah' });
    expect(read).toHaveBeenCalledTimes(1);
    expect(allReads().filter((r) => r !== read).every((r) => r.mock.calls.length === 0)).toBe(true);
    expect(out.type).toBe(Screen);
    expect(out.props.load).toEqual(ready);
  });

  it('CH-13304 CoachHelm off: the board’s own page at once, in the coach’s words, and nothing is read', async () => {
    vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...off });
    const el = (await ClubhouseCoachHelmRoute({ view })) as ReactElement<{ load: unknown }>;
    expect(el.type).toBe(Screen);
    expect(el.props.load).toEqual({ status: 'off', reason: 'Back after the qualifier' });
    for (const r of allReads()) expect(r).not.toHaveBeenCalled();
  });

  it('a gate lookup that failed is the view’s own did-not-load, never "off", and never a read against a switch that may be off', async () => {
    vi.mocked(isCoachHelmEnabledForPlayer).mockRejectedValue(new Error('down'));
    const el = (await ClubhouseCoachHelmRoute({ view })) as ReactElement<{ load: unknown }>;
    expect(el.props.load).toEqual({ status: 'failed' });
    for (const r of allReads()) expect(r).not.toHaveBeenCalled();
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'gate', expect.any(Error), 'coachhelm');

    vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...off, disabledBy: null, disabledReason: 'Lookup failed' });
    const again = (await ClubhouseCoachHelmRoute({ view })) as ReactElement<{ load: unknown }>;
    expect(again.props.load).toEqual({ status: 'failed' });
  });

  it('a coach is a coach here: the view’s address is their board, no player loader runs, and the player’s gate is never asked (a coach who is also a player is a coach)', async () => {
    session.current = maya;
    teamOf.current = { role: 'coach', teamId: 't1', coachId: 'c1' };
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on });
    board.coach.mockResolvedValue({ off: null, roster: { count: 0, error: false }, pulse: { rows: [], error: false }, players: { list: [], error: false }, withoutSignals: 0 });
    const el = (await ClubhouseCoachHelmRoute({ view })) as ReactElement;
    expect(board.coach).toHaveBeenCalled();
    for (const r of allReads()) expect(r).not.toHaveBeenCalled();
    expect(isCoachHelmEnabledForPlayer).not.toHaveBeenCalled();
    expect(el.type).not.toBe(Screen);

    session.current = { ...maya, player: { id: 'pl-coach-as-player' } };
    await ClubhouseCoachHelmRoute({ view });
    for (const r of allReads()) expect(r).not.toHaveBeenCalled();
  });
});

describe('the player’s views and the board', () => {
  it('no session renders nothing; ?view=insights, no view and any other value are the board, not a view', async () => {
    session.current = null;
    expect(await ClubhouseCoachHelmRoute({ view: 'profile' })).toBeNull();
    expect(await ClubhouseCoachHelmRoute({ view: 'standing' })).toBeNull();
    session.current = jonah;
    board.player.mockResolvedValue(PREVIEW_HELM_PLAYER);
    for (const view of [undefined, 'insights', 'nonsense']) {
      const el = (await ClubhouseCoachHelmRoute({ view })) as ReactElement;
      expect(el.type).toBe(PlayerBoard);
    }
    for (const r of allReads()) expect(r).not.toHaveBeenCalled();
  });
});

describe('CH-13930 the player’s sub-navigation', () => {
  const showBoard = (data = PREVIEW_HELM_PLAYER) => render(wrap(<PlayerBoard data={data} />));

  it('Board, Game profile, Standing and Deep dive are one radiogroup of views of this page; Board is the current one', () => {
    showBoard();
    const group = screen.getByRole('radiogroup', { name: 'CoachHelm view' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Board', 'Game profile', 'Standing', 'Deep dive']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
    expect(code('CH-13930')).not.toBeNull();
  });

  it('choosing a view is a route change to its address, with the select haptic; choosing the current one does nothing', async () => {
    showBoard();
    await userEvent.click(screen.getByRole('radio', { name: 'Game profile' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/coachhelm?view=profile');
    await userEvent.click(screen.getByRole('radio', { name: 'Deep dive' }));
    expect(router.push).toHaveBeenLastCalledWith('/golf/dashboard/coachhelm?view=deep-dive');
    router.push.mockClear();
    await userEvent.click(screen.getByRole('radio', { name: 'Board' }));
    expect(router.push).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('select');
  });

  it('CH-13931 Development is a link out, after the group and not a radio: it is Stats’ Development tab', () => {
    showBoard();
    const link = screen.getByRole('link', { name: /Development/ });
    expect(link.getAttribute('href')).toBe('/golf/dashboard/stats?tab=dev');
    expect(within(screen.getByRole('radiogroup')).queryByText('Development')).toBeNull();
  });

  it('on the phone it is a row of chips that scrolls sideways: the current view pressed, Development a link at the end', async () => {
    phoneState.on = true;
    showBoard();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    const row = screen.getByRole('group', { name: 'CoachHelm view' });
    const chips = within(row).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Board', 'Game profile', 'Standing', 'Deep dive']);
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    expect(within(row).getByRole('link', { name: /Development/ }).getAttribute('href')).toBe('/golf/dashboard/stats?tab=dev');
    await userEvent.click(chips[2]!);
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/coachhelm?view=standing');
  });

  it('CH-13304 with CoachHelm off there is no strip: nothing is read and every view would say the same', () => {
    showBoard(PREVIEW_HELM_PLAYER_OFF);
    expect(code('CH-13304')).not.toBeNull();
    expect(code('CH-13930')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
