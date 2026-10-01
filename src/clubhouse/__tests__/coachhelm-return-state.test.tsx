import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolved } from './route-view';

/**
 * CoachHelm (P013), owner rule 8 (2026-10-01): coming back to the page (Back, a reload, a link) returns to what the coach or player
 * had picked: the player on the coach's board, the read on the player's board and on the Deep dive. The pick is written to the address
 * with `history.replaceState` and never through the router (a router navigation re-runs the server render, and the delivery actions
 * behind it record every insight they return as shown); Back restores the render with its first props, so the address is what a
 * remounted screen reads. The Ask composer's draft and History search are in `coachhelm-ask-races.test.tsx`.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));
const board = vi.hoisted(() => ({ player: vi.fn(), coach: vi.fn() }));
vi.mock('../data/coachhelm', async (orig) => ({ ...(await orig<typeof import('../data/coachhelm')>()), loadPlayerCoachHelm: board.player, loadCoachCoachHelm: board.coach, loadPlayerHelmGate: vi.fn(async () => ({ status: 'on' })) }));
vi.mock('../data/coachhelm-chat', () => ({ loadAskCoachHelm: vi.fn() }));
vi.mock('../data/coachhelm-dive', () => ({ loadPlayerDeepDive: vi.fn() }));

import { PREVIEW_HELM_COACH, PREVIEW_HELM_PLAYER } from '../preview/fixtures-coachhelm';
import { PREVIEW_DIVE } from '../preview/fixtures-coachhelm-views';
import type { ChCoachHelmData } from '../data/coachhelm-shape';
import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { DeepDive } from '../screens/coachhelm/views/DeepDive';
import { ToastProvider } from '../ui/Toast';

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
const focusHeading = () => within(document.querySelector('.ch-hl-focus') as HTMLElement).getByRole('heading', { level: 2 }).textContent;
const search = () => new URLSearchParams(window.location.search);
const replaceState = vi.spyOn(window.history, 'replaceState');
const escapeRe = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const routerCalls = () => router.push.mock.calls.length + router.replace.mock.calls.length + router.refresh.mock.calls.length;

beforeEach(() => {
  phoneState.on = false;
  for (const m of [router.push, router.replace, router.refresh]) m.mockClear();
  replaceState.mockClear();
  window.history.replaceState(null, '', '/golf/dashboard/coachhelm');
  replaceState.mockClear();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('CH-13911 the coach’s board returns to the player the coach picked', () => {
  const players = PREVIEW_HELM_COACH.players.list;
  const show = (data: ChCoachHelmData = PREVIEW_HELM_COACH, initialPlayer?: string) => render(wrap(<CoachBoard data={data} initialPlayer={initialPlayer} />));

  it('picking a player writes ?player= to the address in place, and makes no router call at all (no server render, so no exposure counted again)', async () => {
    const u = userEvent.setup();
    show();
    expect(search().get('player')).toBeNull();
    await u.click(screen.getByRole('button', { name: /Priya Natarajan/ }));
    expect(search().get('player')).toBe('pl-priya');
    expect(window.location.search).toBe('?player=pl-priya');
    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, '', '/golf/dashboard/coachhelm?player=pl-priya');
    expect(routerCalls()).toBe(0);
    await u.click(screen.getByRole('button', { name: /Eli Brandt/ }));
    expect(search().get('player')).toBe('pl-eli');
    expect(routerCalls()).toBe(0);
  });

  it('a remount (Back restores the render with its first props: no ?player= from the server) opens on the picked player, from the address', async () => {
    const u = userEvent.setup();
    const first = show();
    await u.click(screen.getByRole('button', { name: /Priya Natarajan/ }));
    const picked = focusHeading();
    first.unmount();
    show(PREVIEW_HELM_COACH, undefined);
    expect(screen.getByRole('button', { name: /Priya Natarajan/ })).toHaveAttribute('aria-pressed', 'true');
    expect(focusHeading()).toBe(picked);
    expect(routerCalls()).toBe(0);
  });

  it('the address wins over a server value that is stale (the props from before the pick), and a player not on the board in it is ignored', () => {
    window.history.replaceState(null, '', '/golf/dashboard/coachhelm?player=pl-theo');
    show(PREVIEW_HELM_COACH, 'pl-jonah');
    expect(screen.getByRole('button', { name: /Theo Marchetti/ })).toHaveAttribute('aria-pressed', 'true');
    cleanup();
    window.history.replaceState(null, '', '/golf/dashboard/coachhelm?player=pl-nobody');
    show(PREVIEW_HELM_COACH, 'pl-jonah');
    expect(screen.getByRole('button', { name: /Jonah Okafor/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('without a pick the board opens on the most pressing player and writes nothing to the address', () => {
    show();
    expect(screen.getByRole('button', { name: new RegExp(players[0]!.name) })).toHaveAttribute('aria-pressed', 'true');
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('a new ?player= from the server (a link to this page for another player) is a new opening on a live board, not a prop copied once', () => {
    const view = show(PREVIEW_HELM_COACH, 'pl-jonah');
    expect(screen.getByRole('button', { name: /Jonah Okafor/ })).toHaveAttribute('aria-pressed', 'true');
    view.rerender(wrap(<CoachBoard data={PREVIEW_HELM_COACH} initialPlayer="pl-priya" />));
    expect(screen.getByRole('button', { name: /Priya Natarajan/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('CH-13911 the player’s board returns to the read the player picked', () => {
  const list = PREVIEW_HELM_PLAYER.insights.list;
  const show = (initialPicked?: string) => render(wrap(<PlayerBoard data={PREVIEW_HELM_PLAYER} initialPicked={initialPicked} />));
  const row = (title: string) => screen.getByRole('button', { name: escapeRe(title) });

  it('picking a read writes ?insight= in place with no router call; a remount opens on it', async () => {
    const u = userEvent.setup();
    const first = show();
    const picked = list[1]!;
    await u.click(row(picked.title));
    expect(search().get('insight')).toBe(picked.id);
    expect(routerCalls()).toBe(0);
    first.unmount();
    show();
    expect(focusHeading()).toBe(picked.title);
    expect(code('CH-13909')).toBeNull();
  });

  it('?insight= names the read the board opens on (the server’s value), the address wins over it, and an id that is not one of the player’s own is ignored', () => {
    show(list[2]!.id);
    expect(focusHeading()).toBe(list[2]!.title);
    cleanup();
    window.history.replaceState(null, '', `/golf/dashboard/coachhelm?insight=${list[1]!.id}`);
    show(list[2]!.id);
    expect(focusHeading()).toBe(list[1]!.title);
    cleanup();
    window.history.replaceState(null, '', '/golf/dashboard/coachhelm?insight=in-someone-elses');
    show();
    expect(focusHeading()).toBe(list[0]!.title);
    expect(code('CH-13909')).toBeNull();
  });
});

describe('CH-13911 the Deep dive returns to the read that was open', () => {
  const list = PREVIEW_DIVE.list;
  const show = (initialId?: string | null) => render(wrap(<DeepDive load={{ status: 'ready', data: PREVIEW_DIVE }} initialId={initialId ?? null} />));
  const heading = () => within(document.querySelector('.ch-hd-main') as HTMLElement).getByRole('heading', { level: 2 }).textContent;

  it('opening a read writes ?insight= in place with no router call; a remount shows that read, not the first', async () => {
    const u = userEvent.setup();
    const first = show();
    const target = list[2]!;
    await u.click(within(screen.getByRole('navigation', { name: 'Your insights' })).getByRole('button', { name: escapeRe(target.base.title) }));
    expect(search().get('insight')).toBe(target.base.id);
    expect(routerCalls()).toBe(0);
    first.unmount();
    show();
    expect(heading()).toBe(target.base.title);
  });

  it('on the phone the open read is the pushed screen: the address names it, and closing it takes the address back', async () => {
    phoneState.on = true;
    const u = userEvent.setup();
    show();
    const target = list[1]!;
    await u.click(within(screen.getByRole('navigation', { name: 'Your insights' })).getByRole('button', { name: escapeRe(target.base.title) }));
    expect(search().get('insight')).toBe(target.base.id);
    await u.click(within(code('CH-13980') as HTMLElement).getByRole('button', { name: /Deep dive/ }));
    // The screen's entry is taken off the history (the list's own entry never carried the name), and the list names nothing.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(search().get('insight')).toBeNull();
    expect(routerCalls()).toBe(0);
  });

  it('on the phone a return (Back from a page the read linked to) opens the same read, from the address', async () => {
    phoneState.on = true;
    const u = userEvent.setup();
    const first = show();
    const target = list[1]!;
    await u.click(within(screen.getByRole('navigation', { name: 'Your insights' })).getByRole('button', { name: escapeRe(target.base.title) }));
    first.unmount();
    show();
    expect(code('CH-13980')).not.toBeNull();
    expect(within(code('CH-13980') as HTMLElement).getByRole('heading', { level: 2 }).textContent).toBe(target.base.title);
  });

  it('CH-13910 a read that was open and is gone after a refresh says so, and the address no longer names a read that is not there', async () => {
    const u = userEvent.setup();
    const view = show();
    const target = list[2]!;
    await u.click(within(screen.getByRole('navigation', { name: 'Your insights' })).getByRole('button', { name: escapeRe(target.base.title) }));
    const without = { ...PREVIEW_DIVE, list: list.filter((i) => i.base.id !== target.base.id) };
    view.rerender(wrap(<DeepDive load={{ status: 'ready', data: without }} />));
    expect(code('CH-13910')?.textContent).toMatch(/no longer on your Deep dive, so this is your first read/);
    expect(heading()).toBe(without.list[0]!.base.title);
    // Opening another clears it.
    await u.click(within(screen.getByRole('navigation', { name: 'Your insights' })).getByRole('button', { name: escapeRe(without.list[1]!.base.title) }));
    expect(code('CH-13910')).toBeNull();
  });

  it('an address that names a read the player does not have opens the first, and says nothing', () => {
    window.history.replaceState(null, '', '/golf/dashboard/coachhelm?view=deep-dive&insight=in-someone-elses');
    show();
    expect(heading()).toBe(list[0]!.base.title);
    expect(code('CH-13910')).toBeNull();
  });
});

describe('CH-13911 the route hands the Board the read it is asked to open on', () => {
  it('?insight= is the Board’s and the Deep dive’s, and means nothing on Game profile or Standing', async () => {
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'pl-jonah' } };
    board.player.mockResolvedValue(PREVIEW_HELM_PLAYER);
    const boardEl = (await resolved(await ClubhouseCoachHelmRoute({ insight: 'in-pen' }))) as { props: { initialPicked?: string } };
    expect(boardEl.props.initialPicked).toBe('in-pen');
    const none = (await resolved(await ClubhouseCoachHelmRoute({}))) as { props: { initialPicked?: string } };
    expect(none.props.initialPicked).toBeUndefined();
  });
});

void act;
