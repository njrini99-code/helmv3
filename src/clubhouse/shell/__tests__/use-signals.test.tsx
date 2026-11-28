import { fireEvent, render, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** E6-E8 (Bridge plan §4.2): the shell configures the queue, counts views and the team switch, numbered taps and rage clicks. */

const signals = vi.hoisted(() => ({ chSignal: vi.fn((_input: unknown) => null), configureSignals: vi.fn(), flushSignals: vi.fn(), suspendSignals: vi.fn() }));
vi.mock('../../lib/signal', () => signals);
vi.mock('next/web-vitals', () => ({ useReportWebVitals: vi.fn() }));

import { useReportWebVitals } from 'next/web-vitals';
import { RAGE_CLICKS, SWITCH_MAX_MS, resetVitalsForTests, useChSignals } from '../use-signals';

const TEAM_A = '66666666-7777-4888-9999-000000000000';
const TEAM_B = '66666666-7777-4888-9999-000000000001';
const kinds = () => signals.chSignal.mock.calls.map(([s]) => s as unknown as Record<string, unknown>);

describe('useChSignals', () => {
  beforeEach(() => {
    signals.chSignal.mockClear();
    signals.configureSignals.mockClear();
    signals.suspendSignals.mockClear();
    vi.mocked(useReportWebVitals).mockClear();
    resetVitalsForTests();
  });
  afterEach(() => document.body.replaceChildren());

  it('tells the queue it is off, and counts nothing', () => {
    renderHook(() => useChSignals({ enabled: false, role: 'coach', teamId: TEAM_A, pathname: '/golf/dashboard/messages', search: '' }));
    expect(signals.configureSignals).toHaveBeenCalledWith({ enabled: false, role: 'coach', teamId: TEAM_A, page: 'P007', route: '/golf/dashboard/messages', userId: null });
    expect(signals.chSignal).not.toHaveBeenCalled();
  });

  it('counts a view on each address, and a team switch as its own', () => {
    const { rerender } = renderHook((p: { pathname: string; teamId: string }) => useChSignals({ enabled: true, role: 'coach', search: '', ...p }), {
      initialProps: { pathname: '/golf/dashboard/messages', teamId: TEAM_A },
    });
    rerender({ pathname: '/golf/dashboard/roster', teamId: TEAM_A });
    rerender({ pathname: '/golf/dashboard/roster', teamId: TEAM_B });
    expect(kinds()).toEqual([{ kind: 'view' }, { kind: 'view' }, { kind: 'view', code: '10103' }]);
    expect(signals.configureSignals).toHaveBeenLastCalledWith({ enabled: true, role: 'coach', teamId: TEAM_B, page: 'P003', route: '/golf/dashboard/roster', userId: null });
  });

  it('reports the three vitals CH-1954 names, CLS in thousandths', () => {
    renderHook(() => useChSignals({ enabled: true, role: 'coach', teamId: null, pathname: '/golf/dashboard', search: '' }));
    const report = vi.mocked(useReportWebVitals).mock.calls.at(-1)![0] as (m: { name: string; value: number }) => void;
    signals.chSignal.mockClear();
    report({ name: 'CLS', value: 0.12 });
    report({ name: 'INP', value: 240 });
    report({ name: 'FCP', value: 900 });
    expect(kinds()).toEqual([
      { kind: 'vital', code: 'CH-1954', act: 'CLS', durationMs: 120 },
      { kind: 'vital', code: 'CH-1954', act: 'INP', durationMs: 240 },
    ]);
  });

  it('counts each vital once when the front door and then the shell mount in one document', () => {
    const gate = renderHook(() => useChSignals({ enabled: true, hold: true, role: 'signed-out', teamId: null, pathname: '/golf/login', search: '' }));
    gate.unmount();
    renderHook(() => useChSignals({ enabled: true, role: 'coach', teamId: null, pathname: '/golf/dashboard', search: '' }));
    signals.chSignal.mockClear();
    // web-vitals keeps every reporter it was handed: each one sees the same metric.
    for (const [report] of vi.mocked(useReportWebVitals).mock.calls) (report as (m: { name: string; value: number }) => void)({ name: 'LCP', value: 1800 });
    expect(kinds()).toEqual([{ kind: 'vital', code: 'CH-1954', act: 'LCP', durationMs: 1800 }]);
  });

  it('holds while nobody is signed in: tells the queue nothing, and a sign-in on that page does not count its view twice', () => {
    const { rerender } = renderHook((p: { hold: boolean; role: string; userId: string | null }) => useChSignals({ enabled: true, teamId: null, pathname: '/golf/login', search: '', ...p }), {
      initialProps: { hold: true, role: 'signed-out', userId: null as string | null },
    });
    expect(signals.configureSignals).not.toHaveBeenCalled();
    expect(kinds()).toEqual([{ kind: 'view' }]);
    rerender({ hold: false, role: 'coach', userId: 'coach-1' });
    expect(signals.configureSignals).toHaveBeenCalledWith({ enabled: true, role: 'coach', teamId: null, page: 'P015', route: '/golf/login', userId: 'coach-1' });
    expect(kinds()).toEqual([{ kind: 'view' }]);
  });

  it('tells the queue to forget whoever it was configured for while it holds (a sign-out that stays in the tab)', () => {
    const { rerender } = renderHook((p: { hold: boolean; pathname: string; role: string; userId: string | null }) => useChSignals({ enabled: true, teamId: TEAM_A, search: '', ...p }), {
      initialProps: { hold: false, pathname: '/golf/dashboard', role: 'coach', userId: 'coach-1' as string | null },
    });
    expect(signals.suspendSignals).not.toHaveBeenCalled();
    signals.configureSignals.mockClear();
    rerender({ hold: true, pathname: '/golf/login', role: 'signed-out', userId: null });
    expect(signals.suspendSignals).toHaveBeenCalledOnce();
    expect(signals.configureSignals).not.toHaveBeenCalled();
    // The suspend comes before the view it holds, so that view never goes out as the coach.
    expect(signals.suspendSignals.mock.invocationCallOrder[0]!).toBeLessThan(signals.chSignal.mock.invocationCallOrder.at(-1)!);
    rerender({ hold: false, pathname: '/golf/login', role: 'player', userId: 'player-2' });
    expect(signals.configureSignals).toHaveBeenCalledWith({ enabled: true, role: 'player', teamId: TEAM_A, page: 'P015', route: '/golf/login', userId: 'player-2' });
  });

  it('counts the next page after a sign-in as its own view', () => {
    const { rerender } = renderHook((p: { hold: boolean; pathname: string; userId: string | null }) => useChSignals({ enabled: true, role: 'player', teamId: null, search: '', ...p }), {
      initialProps: { hold: true, pathname: '/golf/login', userId: null as string | null },
    });
    rerender({ hold: false, pathname: '/golf/player', userId: 'player-2' });
    expect(kinds()).toEqual([{ kind: 'view' }, { kind: 'view' }]);
    expect(signals.configureSignals).toHaveBeenLastCalledWith({ enabled: true, role: 'player', teamId: null, page: 'P015', route: '/golf/player', userId: 'player-2' });
  });

  it('counts a tap on a numbered control, and three clicks on a dead one as a rage click', () => {
    render(
      <div data-ui="clubhouse">
        <button type="button" data-ctl="CTL-P007-004">
          Send
        </button>
        <span data-ctl="CTL-P007-009">Looks like a button</span>
      </div>,
    );
    renderHook(() => useChSignals({ enabled: true, role: 'coach', teamId: null, pathname: '/golf/dashboard/messages', search: '' }));
    signals.chSignal.mockClear();
    const send = document.querySelector('button')!;
    for (let i = 0; i < RAGE_CLICKS; i++) fireEvent.click(send);
    expect(kinds()).toEqual(Array(RAGE_CLICKS).fill({ kind: 'tap', control: 'CTL-P007-004' }));
    signals.chSignal.mockClear();
    const dead = document.querySelector('span')!;
    for (let i = 0; i < RAGE_CLICKS; i++) fireEvent.click(dead);
    expect(kinds().filter((s) => s.kind === 'frustration')).toEqual([{ kind: 'frustration', code: 'CH-1951', control: 'CTL-P007-009' }]);
  });

  it("configures the queue for the new page before that page's own signals run (a child's effects run first)", () => {
    function Page({ path }: { path: string }) {
      useEffect(() => {
        signals.chSignal({ kind: 'state', code: 'CH-4201', page: path } as never);
      }, [path]);
      return null;
    }
    function Shell({ pathname }: { pathname: string }) {
      useChSignals({ enabled: true, role: 'coach', teamId: TEAM_A, pathname, search: '' });
      return <Page path={pathname} />;
    }
    const { rerender } = render(<Shell pathname="/golf/dashboard/roster" />);
    signals.chSignal.mockClear();
    signals.configureSignals.mockClear();
    rerender(<Shell pathname="/golf/dashboard/stats" />);
    expect(signals.configureSignals).toHaveBeenCalledWith(expect.objectContaining({ page: 'P004' }));
    const configured = signals.configureSignals.mock.invocationCallOrder[0]!;
    const state = signals.chSignal.mock.calls.findIndex(([s]) => (s as { kind: string }).kind === 'state');
    expect(state).toBeGreaterThanOrEqual(0);
    expect(signals.chSignal.mock.invocationCallOrder[state]!).toBeGreaterThan(configured);
    // The view goes before the page's states, too, so its timeline reads in order.
    expect(kinds().map((k) => k.kind)).toEqual(['view', 'state']);
  });

  it('ignores clicks outside Clubhouse', () => {
    render(<span>outside</span>);
    renderHook(() => useChSignals({ enabled: true, role: 'coach', teamId: null, pathname: '/golf/dashboard', search: '' }));
    signals.chSignal.mockClear();
    for (let i = 0; i < RAGE_CLICKS; i++) fireEvent.click(document.querySelector('span')!);
    expect(signals.chSignal).not.toHaveBeenCalled();
  });
});

/** Bridge Speed: a view after a tap on an in-app link, or after back, carries the time until the new page painted. */
describe('useChSignals switch time', () => {
  let now = 1000;
  let frames: Array<FrameRequestCallback | null> = [];
  let clock: ReturnType<typeof vi.spyOn>;
  const runFrame = () => {
    const due = frames;
    frames = [];
    due.forEach((cb) => cb?.(now));
  };
  type Props = { pathname: string; teamId?: string | null };
  const mount = (pathname = '/golf/dashboard/messages') =>
    renderHook((p: Props) => useChSignals({ enabled: true, role: 'coach', search: '', teamId: p.teamId ?? TEAM_A, pathname: p.pathname }), { initialProps: { pathname } });
  const tapLink = (href: string, init: MouseEventInit = {}) => {
    const { container } = render(
      <a href={href} onClick={(e) => e.preventDefault()}>
        go
      </a>,
    );
    fireEvent.click(container.querySelector('a')!, init);
  };

  beforeEach(() => {
    signals.chSignal.mockClear();
    signals.configureSignals.mockClear();
    now = 1000;
    frames = [];
    clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames[id - 1] = null;
    });
  });
  afterEach(() => {
    clock.mockRestore();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/');
  });

  it('sends the first view of a load at once, with no duration', () => {
    mount();
    expect(kinds()).toEqual([{ kind: 'view' }]);
    expect(frames).toHaveLength(0);
  });

  it('times a tap on a link to the new page painted, and sends it on the view', () => {
    const { rerender } = mount();
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/roster');
    now = 1180;
    rerender({ pathname: '/golf/dashboard/roster' });
    expect(kinds()).toEqual([]);
    now = 1200;
    runFrame();
    expect(kinds()).toEqual([]);
    now = 1240;
    runFrame();
    expect(kinds()).toEqual([{ kind: 'view', page: 'P003', route: '/golf/dashboard/roster', durationMs: 240 }]);
  });

  it('times a back or forward step from the moment the browser moved', () => {
    const { rerender } = mount();
    signals.chSignal.mockClear();
    window.history.pushState(null, '', '/golf/dashboard/roster');
    window.dispatchEvent(new PopStateEvent('popstate'));
    now = 1100;
    rerender({ pathname: '/golf/dashboard/roster' });
    runFrame();
    runFrame();
    expect(kinds()).toEqual([{ kind: 'view', page: 'P003', route: '/golf/dashboard/roster', durationMs: 100 }]);
  });

  it('sends no duration when the start is unknown: a push from code, or a tap that went somewhere else', () => {
    const { rerender } = mount();
    signals.chSignal.mockClear();
    rerender({ pathname: '/golf/dashboard/roster' });
    tapLink('/golf/dashboard/calendar');
    rerender({ pathname: '/golf/dashboard/messages' });
    expect(kinds()).toEqual([{ kind: 'view' }, { kind: 'view' }]);
    expect(frames).toHaveLength(0);
  });

  it('ignores a link opened in a new tab and a tap on a link to this page', () => {
    const { rerender } = mount();
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/roster', { metaKey: true });
    tapLink('/');
    rerender({ pathname: '/golf/dashboard/roster' });
    expect(kinds()).toEqual([{ kind: 'view' }]);
  });

  it('sends no duration for a switch slower than SWITCH_MAX_MS', () => {
    const { rerender } = mount();
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/roster');
    now += SWITCH_MAX_MS + 1;
    rerender({ pathname: '/golf/dashboard/roster' });
    expect(kinds()).toEqual([{ kind: 'view' }]);
  });

  it('still counts a view that is left before it painted, untimed, on its own page', () => {
    const { rerender, unmount } = mount();
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/roster');
    rerender({ pathname: '/golf/dashboard/roster' });
    rerender({ pathname: '/golf/dashboard/calendar' });
    runFrame();
    runFrame();
    expect(kinds()).toEqual([{ kind: 'view', page: 'P003', route: '/golf/dashboard/roster' }, { kind: 'view' }]);
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/messages');
    rerender({ pathname: '/golf/dashboard/messages' });
    unmount();
    expect(kinds()).toEqual([{ kind: 'view', page: 'P007', route: '/golf/dashboard/messages' }]);
  });

  it('sends a waiting view untimed when the tab is put away', () => {
    const { rerender } = mount();
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/roster');
    rerender({ pathname: '/golf/dashboard/roster' });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockRestore();
    runFrame();
    runFrame();
    expect(kinds()).toEqual([{ kind: 'view', page: 'P003', route: '/golf/dashboard/roster' }]);
  });
  it('times a switch that only the query makes: Team stats to one player is P004 to P005', () => {
    window.history.replaceState(null, '', '/golf/dashboard/stats');
    const { rerender } = renderHook((p: { search: string }) => useChSignals({ enabled: true, role: 'coach', teamId: TEAM_A, pathname: '/golf/dashboard/stats', search: p.search }), {
      initialProps: { search: '' },
    });
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/stats?player=p1');
    now = 1150;
    rerender({ search: '?player=p1' });
    runFrame();
    runFrame();
    expect(kinds()).toEqual([{ kind: 'view', page: 'P005', route: '/golf/dashboard/stats?player', durationMs: 150 }]);
  });

  it('counts a query that opens a screen of its own (CoachHelm to Ask) as a view on that screen, timed', () => {
    window.history.replaceState(null, '', '/golf/dashboard/coachhelm');
    const { rerender } = renderHook((p: { search: string }) => useChSignals({ enabled: true, role: 'coach', teamId: TEAM_A, pathname: '/golf/dashboard/coachhelm', search: p.search }), {
      initialProps: { search: '' },
    });
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/coachhelm?view=ask');
    now = 1090;
    rerender({ search: '?view=ask' });
    runFrame();
    runFrame();
    expect(kinds()).toEqual([{ kind: 'view', page: 'P013', route: '/golf/dashboard/coachhelm?view=ask', durationMs: 90 }]);
    expect(signals.configureSignals).toHaveBeenLastCalledWith(expect.objectContaining({ page: 'P013', route: '/golf/dashboard/coachhelm?view=ask' }));
  });

  it('counts no new view for a query that only filters the screen', () => {
    const { rerender } = renderHook((p: { search: string }) => useChSignals({ enabled: true, role: 'coach', teamId: TEAM_A, pathname: '/golf/dashboard/rounds', search: p.search }), {
      initialProps: { search: '' },
    });
    signals.chSignal.mockClear();
    rerender({ search: '?range=week' });
    rerender({ search: '?range=season' });
    expect(kinds()).toEqual([]);
  });

  it('does not time a query that stays on the same page, or a tap on a link to the same page with a filter', () => {
    window.history.replaceState(null, '', '/golf/dashboard/messages');
    const { rerender } = renderHook((p: { search: string }) => useChSignals({ enabled: true, role: 'coach', teamId: TEAM_A, pathname: '/golf/dashboard/messages', search: p.search }), {
      initialProps: { search: '' },
    });
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/messages?thread=t1');
    rerender({ search: '?thread=t1' });
    expect(frames).toHaveLength(0);
  });

  it('drops a switch start when the tab is put away before the new page arrives', () => {
    const { rerender } = mount();
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/roster');
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockRestore();
    now = 20_000;
    rerender({ pathname: '/golf/dashboard/roster' });
    // No start, so the view goes at once, untimed, and nothing waits on a frame.
    expect(frames).toHaveLength(0);
    expect(kinds()).toEqual([{ kind: 'view' }]);
  });
});
