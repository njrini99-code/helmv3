import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolved } from './route-view';

/**
 * CoachHelm (P013), owner rule 8 (2026-10-01): coming back to the page returns to what the coach or player had picked: the player on
 * the coach's board, the read on the player's board and on the Deep dive. The pick is kept for the tab with the shell's session state
 * (`useChSessionState`, keyed by the route and team) and the screens never touch the address or the history: a `history.replaceState`
 * that hands Next the entry's own state is not seen by its router, so the next `router.refresh()` or revalidating action would
 * navigate to the old address and reset it (a pick written there is lost, or a history entry pushed twice). `?player=` and
 * `?insight=` are read-only inputs (the props the route makes from them): one named on arrival wins over a kept pick. The Ask page's
 * own draft, panel and search are in `coachhelm-ask-races.test.tsx`.
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
import type { ChDeepDive } from '../data/coachhelm-dive-shape';
import type { ChCoachHelmData } from '../data/coachhelm-shape';
import type { ChViewLoad } from '../data/coachhelm-views-shape';
import { markAppRunning, RouteScope } from '../lib/session-state';
import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { DeepDive } from '../screens/coachhelm/views/DeepDive';
import { ToastProvider } from '../ui/Toast';

/** The page's route and team, as the shell frames it (`RouteFrame`): what a screen's kept state is stored under. */
const SCOPE = '/golf/dashboard/coachhelm\u0000team-1';
const wrap = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <RouteScope value={SCOPE}>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </RouteScope>
    </ToastProvider>
  </LazyMotion>
);
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const focusHeading = () => within(document.querySelector('.ch-hl-focus') as HTMLElement).getByRole('heading', { level: 2 }).textContent;
const escapeRe = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const replaceState = vi.spyOn(window.history, 'replaceState');
const pushState = vi.spyOn(window.history, 'pushState');
const historyWrites = () => replaceState.mock.calls.length + pushState.mock.calls.length;
const routerCalls = () => router.push.mock.calls.length + router.replace.mock.calls.length;
const stored = () => Object.keys(sessionStorage).filter((k) => k.startsWith('ch:screen:'));
const pressed = (name: RegExp) => expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');

beforeEach(() => {
  markAppRunning();
  sessionStorage.clear();
  phoneState.on = false;
  for (const m of [router.push, router.replace, router.refresh]) m.mockClear();
  window.history.replaceState(null, '', '/golf/dashboard/coachhelm');
  replaceState.mockClear();
  pushState.mockClear();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('CH-13911 the coach’s board returns to the player the coach picked', () => {
  const players = PREVIEW_HELM_COACH.players.list;
  const show = (data: ChCoachHelmData = PREVIEW_HELM_COACH, initialPlayer?: string) => render(wrap(<CoachBoard data={data} initialPlayer={initialPlayer} />));

  it('a pick is kept for the tab and writes nothing to the address or the history; a remount (Back) opens on that player', async () => {
    const u = userEvent.setup();
    const first = show();
    await u.click(screen.getByRole('button', { name: /Priya Natarajan/ }));
    const picked = focusHeading();
    expect(stored()).toHaveLength(1);
    expect(historyWrites()).toBe(0);
    expect(window.location.search).toBe('');
    expect(routerCalls()).toBe(0);
    first.unmount();
    show();
    pressed(/Priya Natarajan/);
    expect(focusHeading()).toBe(picked);
    expect(historyWrites()).toBe(0);
  });

  it('with nothing kept the board opens on the most pressing player and stores nothing', () => {
    show();
    pressed(new RegExp(players[0]!.name));
    expect(stored()).toHaveLength(0);
    expect(historyWrites()).toBe(0);
  });

  it('a player ?player= names wins over a kept pick (a link from Roster must open that player), and the kept pick returns where the address names none', async () => {
    const u = userEvent.setup();
    const first = show();
    await u.click(screen.getByRole('button', { name: /Eli Brandt/ }));
    first.unmount();
    show(PREVIEW_HELM_COACH, 'pl-jonah');
    pressed(/Jonah Okafor/);
    cleanup();
    show();
    pressed(/Eli Brandt/);
  });

  it('a player ?player= names who is not on the board is ignored: the kept pick, else the most pressing player', async () => {
    const u = userEvent.setup();
    show(PREVIEW_HELM_COACH, 'pl-nobody');
    pressed(new RegExp(players[0]!.name));
    await u.click(screen.getByRole('button', { name: /Theo Marchetti/ }));
    cleanup();
    show(PREVIEW_HELM_COACH, 'pl-nobody');
    pressed(/Theo Marchetti/);
  });

  it('a new ?player= from the server (a link to this page for another player) is a new opening on a live board, even after a pick by hand', async () => {
    const u = userEvent.setup();
    const view = show(PREVIEW_HELM_COACH, 'pl-jonah');
    pressed(/Jonah Okafor/);
    await u.click(screen.getByRole('button', { name: /Theo Marchetti/ }));
    pressed(/Theo Marchetti/);
    view.rerender(wrap(<CoachBoard data={PREVIEW_HELM_COACH} initialPlayer="pl-priya" />));
    pressed(/Priya Natarajan/);
  });

  it('a refresh (the server answering again, as Try again or a revalidating action makes it) keeps the pick, and the address stays as it was', async () => {
    const u = userEvent.setup();
    window.history.replaceState(null, '', '/golf/dashboard/coachhelm?player=pl-jonah');
    replaceState.mockClear();
    const view = show(PREVIEW_HELM_COACH, 'pl-jonah');
    await u.click(screen.getByRole('button', { name: /Theo Marchetti/ }));
    view.rerender(wrap(<CoachBoard data={{ ...PREVIEW_HELM_COACH }} initialPlayer="pl-jonah" />));
    pressed(/Theo Marchetti/);
    expect(window.location.search).toBe('?player=pl-jonah');
    expect(historyWrites()).toBe(0);
  });

  it('Roster’s View insights for Eli, the players read failing and then Try again answering: the board opens on Eli, not on the first player', () => {
    const failed: ChCoachHelmData = { ...PREVIEW_HELM_COACH, players: { list: [], error: true }, withoutSignals: 0 };
    const view = show(failed, 'pl-eli');
    expect(screen.queryByRole('button', { name: /Eli Brandt/ })).toBeNull();
    view.rerender(wrap(<CoachBoard data={PREVIEW_HELM_COACH} initialPlayer="pl-eli" />));
    pressed(/Eli Brandt/);
    expect(screen.getByRole('button', { name: new RegExp(players[0]!.name) })).toHaveAttribute('aria-pressed', players[0]!.id === 'pl-eli' ? 'true' : 'false');
  });
});

describe('CH-13911 the player’s board returns to the read the player picked', () => {
  const list = PREVIEW_HELM_PLAYER.insights.list;
  const show = () => render(wrap(<PlayerBoard data={PREVIEW_HELM_PLAYER} />));
  const row = (title: string) => screen.getByRole('button', { name: escapeRe(title) });

  it('a pick is kept for the tab and writes nothing to the address or the history; a remount opens on it', async () => {
    const u = userEvent.setup();
    const first = show();
    const picked = list[1]!;
    await u.click(row(picked.title));
    expect(stored()).toHaveLength(1);
    expect(historyWrites()).toBe(0);
    expect(window.location.search).toBe('');
    expect(routerCalls()).toBe(0);
    first.unmount();
    show();
    expect(focusHeading()).toBe(picked.title);
    expect(code('CH-13909')).toBeNull();
  });

  it('the board reads no ?insight= from the address (that names a read on the Deep dive only), and a refresh keeps the pick', async () => {
    const u = userEvent.setup();
    window.history.replaceState(null, '', `/golf/dashboard/coachhelm?insight=${list[2]!.id}`);
    replaceState.mockClear();
    const view = show();
    expect(focusHeading()).toBe(list[0]!.title);
    await u.click(row(list[1]!.title));
    view.rerender(wrap(<PlayerBoard data={{ ...PREVIEW_HELM_PLAYER }} />));
    expect(focusHeading()).toBe(list[1]!.title);
    expect(window.location.search).toBe(`?insight=${list[2]!.id}`);
    expect(historyWrites()).toBe(0);
  });
});

describe('CH-13911 the Deep dive returns to the read that was open', () => {
  const list = PREVIEW_DIVE.list;
  const ready = (data: ChDeepDive = PREVIEW_DIVE): ChViewLoad<ChDeepDive> => ({ status: 'ready', data });
  const show = (initialId?: string | null, load: ChViewLoad<ChDeepDive> = ready()) => render(wrap(<DeepDive load={load} initialId={initialId ?? null} />));
  const heading = () => within(document.querySelector('.ch-hd-main') as HTMLElement).getByRole('heading', { level: 2 }).textContent;
  const openRead = (title: string) => within(screen.getByRole('navigation', { name: 'Your insights' })).getByRole('button', { name: escapeRe(title) });

  it('opening a read is kept for the tab and writes nothing to the address or the history; a remount shows that read, not the first', async () => {
    const u = userEvent.setup();
    const first = show();
    const target = list[2]!;
    await u.click(openRead(target.base.title));
    expect(stored()).toHaveLength(1);
    expect(historyWrites()).toBe(0);
    expect(window.location.search).toBe('');
    expect(routerCalls()).toBe(0);
    first.unmount();
    show();
    expect(heading()).toBe(target.base.title);
    expect(historyWrites()).toBe(0);
  });

  it('a read ?insight= names wins over a kept one, the kept one returns where the address names none, and an id that is not the player’s is ignored', async () => {
    const u = userEvent.setup();
    const first = show();
    await u.click(openRead(list[2]!.base.title));
    first.unmount();
    show(list[1]!.base.id);
    expect(heading()).toBe(list[1]!.base.title);
    cleanup();
    show('in-someone-elses');
    expect(heading()).toBe(list[2]!.base.title);
    expect(code('CH-13910')).toBeNull();
  });

  it('the read ?insight= names opens even when the first load failed and Try again answered (nothing had been picked by hand), and the address is never written', () => {
    const view = show(list[1]!.base.id, { status: 'failed' });
    expect(code('CH-13280')).not.toBeNull();
    view.rerender(wrap(<DeepDive load={ready()} initialId={list[1]!.base.id} />));
    expect(heading()).toBe(list[1]!.base.title);
    expect(historyWrites()).toBe(0);
  });

  it('a pick by hand after that stands over a refresh, and a new ?insight= from the server is a new opening', async () => {
    const u = userEvent.setup();
    const view = show(list[1]!.base.id);
    await u.click(openRead(list[2]!.base.title));
    view.rerender(wrap(<DeepDive load={ready({ ...PREVIEW_DIVE })} initialId={list[1]!.base.id} />));
    expect(heading()).toBe(list[2]!.base.title);
    view.rerender(wrap(<DeepDive load={ready()} initialId={list[0]!.base.id} />));
    expect(heading()).toBe(list[0]!.base.title);
  });

  it('on the phone the open read is the pushed screen; closing it forgets it, and a return to a read left open opens the same read', async () => {
    phoneState.on = true;
    const u = userEvent.setup();
    const first = show();
    const target = list[1]!;
    await u.click(openRead(target.base.title));
    expect(code('CH-13980')).not.toBeNull();
    expect(replaceState).not.toHaveBeenCalledWith(expect.anything(), '', expect.stringContaining('insight='));
    // Left from inside the read: a return opens the same read.
    first.unmount();
    const back = show();
    expect(within(code('CH-13980') as HTMLElement).getByRole('heading', { level: 2 }).textContent).toBe(target.base.title);
    // The screen's own back closes it and the kept read goes with it.
    await u.click(within(code('CH-13980') as HTMLElement).getByRole('button', { name: /Deep dive/ }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(stored()).toHaveLength(0);
    back.unmount();
    show();
    expect(code('CH-13980')).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('CH-13910 a read that was open and is gone after a refresh says so; opening another clears it', async () => {
    const u = userEvent.setup();
    const view = show();
    const target = list[2]!;
    await u.click(openRead(target.base.title));
    const without = { ...PREVIEW_DIVE, list: list.filter((i) => i.base.id !== target.base.id) };
    view.rerender(wrap(<DeepDive load={ready(without)} />));
    expect(code('CH-13910')?.textContent).toMatch(/no longer on your Deep dive, so this is your first read/);
    expect(heading()).toBe(without.list[0]!.base.title);
    await u.click(openRead(without.list[1]!.base.title));
    expect(code('CH-13910')).toBeNull();
  });
});

describe('CH-13911 a switch of view never carries the last view’s pick, and the address is not what a screen reads', () => {
  const dive = PREVIEW_DIVE.list;
  const insights = PREVIEW_HELM_PLAYER.insights.list;
  const diveHeading = () => within(document.querySelector('.ch-hd-main') as HTMLElement).getByRole('heading', { level: 2 }).textContent;

  it('Board with a read picked, then the Deep dive: it opens on its first read (the tab links carry no ?insight=), and the other way round', async () => {
    const u = userEvent.setup();
    const board1 = render(wrap(<PlayerBoard data={PREVIEW_HELM_PLAYER} />));
    await u.click(screen.getByRole('button', { name: escapeRe(insights[1]!.title) }));
    board1.unmount();
    // The next view mounts before the address commits: the old view's ?insight= is still in it, and is not read.
    window.history.replaceState(null, '', `/golf/dashboard/coachhelm?insight=${dive[2]!.base.id}`);
    const view = render(wrap(<DeepDive load={{ status: 'ready', data: PREVIEW_DIVE }} initialId={null} />));
    expect(diveHeading()).toBe(dive[0]!.base.title);
    expect(code('CH-13910')).toBeNull();
    await u.click(within(screen.getByRole('navigation', { name: 'Your insights' })).getByRole('button', { name: escapeRe(dive[1]!.base.title) }));
    view.unmount();
    render(wrap(<PlayerBoard data={PREVIEW_HELM_PLAYER} />));
    expect(focusHeading()).toBe(insights[1]!.title);
    expect(code('CH-13909')).toBeNull();
  });

  it('the route hands only the Deep dive the read ?insight= names; the Board and the other views get none', async () => {
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'pl-jonah' } };
    board.player.mockResolvedValue(PREVIEW_HELM_PLAYER);
    const boardEl = (await resolved(await ClubhouseCoachHelmRoute({ insight: 'in-pen' }))) as { props: Record<string, unknown> };
    expect(boardEl.props).not.toHaveProperty('initialPicked');
    expect(boardEl.props).not.toHaveProperty('insight');
    const diveEl = (await resolved(await ClubhouseCoachHelmRoute({ view: 'deep-dive', insight: 'in-pen' }))) as { props: { initialId?: string | null } };
    expect(diveEl.props.initialId).toBe('in-pen');
    const bare = (await resolved(await ClubhouseCoachHelmRoute({ view: 'deep-dive' }))) as { props: { initialId?: string | null } };
    expect(bare.props.initialId).toBeNull();
  });
});

describe('CH-13911 a kept pick is never drawn while the screen hydrates', () => {
  /**
   * Every CoachHelm view sits in the route's one Suspense, so a hard reload can hydrate one after the shell has marked the app running,
   * which is when a kept value is read. The server's markup is made with nothing kept; the browser then has a pick in the tab.
   */
  async function hydratesCleanly(make: () => ReactNode, pick: () => Promise<void>, shown: (host: HTMLElement) => void) {
    const first = render(wrap(make()));
    await pick();
    first.unmount();
    const kept = Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k) as string]));
    expect(Object.keys(kept)).not.toHaveLength(0);
    sessionStorage.clear();
    const html = renderToString(wrap(make()));
    for (const [k, v] of Object.entries(kept)) sessionStorage.setItem(k, v);
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(a.map(String).join(' '));
    });
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(host, wrap(make()), { onRecoverableError: (e) => errors.push(String((e as Error)?.message ?? e)) });
    });
    spy.mockRestore();
    expect(errors.filter((e) => /hydrat|did not match|didn't match/i.test(e))).toEqual([]);
    shown(host);
    act(() => root?.unmount());
    host.remove();
  }

  it('the coach’s board', async () => {
    const u = userEvent.setup();
    await hydratesCleanly(
      () => <CoachBoard data={PREVIEW_HELM_COACH} />,
      () => u.click(screen.getByRole('button', { name: /Priya Natarajan/ })),
      (host) => expect(within(host).getByRole('button', { name: /Priya Natarajan/ })).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('the player’s board', async () => {
    const u = userEvent.setup();
    const target = PREVIEW_HELM_PLAYER.insights.list[1]!;
    await hydratesCleanly(
      () => <PlayerBoard data={PREVIEW_HELM_PLAYER} />,
      () => u.click(screen.getByRole('button', { name: escapeRe(target.title) })),
      (host) => expect(within(host.querySelector('.ch-hl-focus') as HTMLElement).getByRole('heading', { level: 2 }).textContent).toBe(target.title),
    );
  });

  it('the Deep dive', async () => {
    const u = userEvent.setup();
    const target = PREVIEW_DIVE.list[2]!;
    await hydratesCleanly(
      () => <DeepDive load={{ status: 'ready', data: PREVIEW_DIVE }} />,
      () => u.click(within(screen.getByRole('navigation', { name: 'Your insights' })).getByRole('button', { name: escapeRe(target.base.title) })),
      (host) => expect(within(host.querySelector('.ch-hd-main') as HTMLElement).getByRole('heading', { level: 2 }).textContent).toBe(target.base.title),
    );
  });
});
