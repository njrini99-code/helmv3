import { fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** E6-E8 (Bridge plan §4.2): the shell configures the queue, counts views and the team switch, numbered taps and rage clicks. */

const signals = vi.hoisted(() => ({ chSignal: vi.fn((_input: unknown) => null), configureSignals: vi.fn(), flushSignals: vi.fn() }));
vi.mock('../../lib/signal', () => signals);
vi.mock('next/web-vitals', () => ({ useReportWebVitals: vi.fn() }));

import { useReportWebVitals } from 'next/web-vitals';
import { RAGE_CLICKS, SWITCH_MAX_MS, useChSignals } from '../use-signals';

const TEAM_A = '66666666-7777-4888-9999-000000000000';
const TEAM_B = '66666666-7777-4888-9999-000000000001';
const kinds = () => signals.chSignal.mock.calls.map(([s]) => s as unknown as Record<string, unknown>);

describe('useChSignals', () => {
  beforeEach(() => {
    signals.chSignal.mockClear();
    signals.configureSignals.mockClear();
  });
  afterEach(() => document.body.replaceChildren());

  it('tells the queue it is off, and counts nothing', () => {
    renderHook(() => useChSignals({ enabled: false, role: 'coach', teamId: TEAM_A, pathname: '/golf/dashboard/messages', search: '' }));
    expect(signals.configureSignals).toHaveBeenCalledWith({ enabled: false, role: 'coach', teamId: TEAM_A, page: 'P007', userId: null });
    expect(signals.chSignal).not.toHaveBeenCalled();
  });

  it('counts a view on each address, and a team switch as its own', () => {
    const { rerender } = renderHook((p: { pathname: string; teamId: string }) => useChSignals({ enabled: true, role: 'coach', search: '', ...p }), {
      initialProps: { pathname: '/golf/dashboard/messages', teamId: TEAM_A },
    });
    rerender({ pathname: '/golf/dashboard/roster', teamId: TEAM_A });
    rerender({ pathname: '/golf/dashboard/roster', teamId: TEAM_B });
    expect(kinds()).toEqual([{ kind: 'view' }, { kind: 'view' }, { kind: 'view', code: '10103' }]);
    expect(signals.configureSignals).toHaveBeenLastCalledWith({ enabled: true, role: 'coach', teamId: TEAM_B, page: 'P003', userId: null });
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
    expect(kinds()).toEqual([{ kind: 'view', page: 'P003', durationMs: 240 }]);
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
    expect(kinds()).toEqual([{ kind: 'view', page: 'P003', durationMs: 100 }]);
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
    expect(kinds()).toEqual([{ kind: 'view', page: 'P003' }, { kind: 'view' }]);
    signals.chSignal.mockClear();
    tapLink('/golf/dashboard/messages');
    rerender({ pathname: '/golf/dashboard/messages' });
    unmount();
    expect(kinds()).toEqual([{ kind: 'view', page: 'P007' }]);
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
    expect(kinds()).toEqual([{ kind: 'view', page: 'P003' }]);
  });
});
