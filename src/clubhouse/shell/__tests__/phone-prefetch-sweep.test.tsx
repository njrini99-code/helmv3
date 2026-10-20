import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { CH_SWEEP_AGAIN_MS, CH_SWEEP_AT_ONCE, CH_SWEEP_GAP_MS, resetPrefetchTabsForTests, sweepQueue, usePrefetchTabs } from '../use-prefetch-tabs';

const HOME = '/golf/dashboard';
const CAL = '/golf/dashboard/calendar';
const STATS = '/golf/dashboard/stats';
const TABS = [HOME, CAL, STATS];
const MESSAGES = '/golf/dashboard/messages';
const HUB = '/golf/dashboard/team';
const ROSTER = '/golf/dashboard/roster';
const QUALIFIERS = '/golf/dashboard/qualifiers';
const RECRUITING = '/golf/dashboard/recruiting';
const SETTINGS = '/golf/dashboard/settings';
const MORE = [MESSAGES, HUB, ROSTER, QUALIFIERS, RECRUITING, SETTINGS];
const SECTIONS = [...TABS, ...MORE];

const asked = () => router.prefetch.mock.calls.map(([href]) => href as string);
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
/** The first page painted: two frames, and the tabs are asked for. */
const painted = () => advance(40);
/** The idle moment each batch waits for (a timeout in jsdom). */
const idle = () => advance(400);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  resetPrefetchTabsForTests();
  router.prefetch.mockClear();
  router.refresh.mockClear();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(window.navigator, 'connection', { value: undefined, configurable: true });
});
afterEach(() => vi.useRealTimers());

describe('the idle sweep of the sections the strip reaches (L10)', () => {
  it('asks for the tabs first, then the other sections, never more than two at a time', () => {
    renderHook(() => usePrefetchTabs(TABS, HOME, SECTIONS));
    painted();
    expect(asked()).toEqual([CAL, STATS]);
    idle();
    expect(asked()).toEqual([CAL, STATS, MESSAGES, HUB]);
    // The next batch waits for the gap, then for idle.
    advance(CH_SWEEP_GAP_MS - 1);
    expect(asked()).toHaveLength(4);
    advance(1);
    idle();
    expect(asked().slice(4)).toEqual([ROSTER, QUALIFIERS]);
    advance(CH_SWEEP_GAP_MS);
    idle();
    expect(asked().slice(6)).toEqual([RECRUITING, SETTINGS]);
    advance(CH_SWEEP_GAP_MS);
    idle();
    expect(asked()).toHaveLength(8);
    for (let i = 4; i < asked().length; i += CH_SWEEP_AT_ONCE) expect(asked().slice(i, i + CH_SWEEP_AT_ONCE).length).toBeLessThanOrEqual(CH_SWEEP_AT_ONCE);
  });

  it('every ask is a whole page, like the tabs', () => {
    renderHook(() => usePrefetchTabs(TABS, HOME, SECTIONS));
    painted();
    idle();
    for (const [, options] of router.prefetch.mock.calls) expect(options).toEqual({ kind: 'full' });
  });

  it('asks for nothing with Data Saver on or offline, and stops if either comes on mid sweep', () => {
    Object.defineProperty(window.navigator, 'connection', { value: { saveData: true }, configurable: true });
    renderHook(() => usePrefetchTabs(TABS, HOME, SECTIONS));
    painted();
    idle();
    advance(CH_SWEEP_GAP_MS * 3);
    expect(router.prefetch).not.toHaveBeenCalled();

    Object.defineProperty(window.navigator, 'connection', { value: undefined, configurable: true });
    resetPrefetchTabsForTests();
    renderHook(() => usePrefetchTabs(TABS, HOME, SECTIONS));
    painted();
    idle();
    expect(asked()).toEqual([CAL, STATS, MESSAGES, HUB]);
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    advance(CH_SWEEP_GAP_MS);
    idle();
    expect(asked()).toHaveLength(4);
  });

  it('leaves out the page on screen and a section the visit memory already asked for', () => {
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at, SECTIONS), { initialProps: { at: ROSTER } });
    painted();
    idle();
    // Roster is the page on screen (not a tab): the three tabs, then the first two sections before it.
    expect(asked().slice(0, 3).sort()).toEqual([HOME, CAL, STATS].sort());
    expect(asked().slice(3)).toEqual([MESSAGES, HUB]);
    view.rerender({ at: HOME });
    idle();
    // Roster was just left: kept as a visit (asked for with the tabs), so the sweep skips it.
    expect(asked().filter((h) => h === ROSTER)).toHaveLength(1);
  });

  it('a navigation does not start the sweep over: what was asked for is held', () => {
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at, SECTIONS), { initialProps: { at: HOME } });
    painted();
    idle();
    advance(CH_SWEEP_GAP_MS);
    idle();
    const before = asked().length;
    view.rerender({ at: CAL });
    idle();
    const sectionAsks = asked().slice(before).filter((h) => MORE.includes(h));
    // The next section in line, not the first ones again.
    expect(sectionAsks.every((h) => [QUALIFIERS, RECRUITING, SETTINGS].includes(h))).toBe(true);
  });

  it('a refresh drops what Next held, yet a section is not asked for again inside two minutes', () => {
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at, SECTIONS), { initialProps: { at: HOME } });
    painted();
    for (let i = 0; i < 4; i++) {
      idle();
      advance(CH_SWEEP_GAP_MS);
    }
    const first = asked().filter((h) => h === MESSAGES).length;
    expect(first).toBe(1);
    // 40s on, a tab is revisited: held for more than 30s, it is refreshed, which drops every held page.
    advance(40_000);
    view.rerender({ at: CAL });
    painted();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 6; i++) {
      advance(CH_SWEEP_GAP_MS);
      idle();
    }
    expect(asked().filter((h) => h === MESSAGES)).toHaveLength(1);
    // Past the rest, the next refresh lets the sweep ask again.
    advance(CH_SWEEP_AGAIN_MS);
    view.rerender({ at: STATS });
    painted();
    view.rerender({ at: HOME });
    advance(40_000);
    view.rerender({ at: CAL });
    painted();
    for (let i = 0; i < 6; i++) {
      advance(CH_SWEEP_GAP_MS);
      idle();
    }
    expect(asked().filter((h) => h === MESSAGES).length).toBeGreaterThan(1);
  });

  it('sweepQueue keeps the strip order and drops tabs, the current page and visits', () => {
    expect(sweepQueue(SECTIONS, TABS, ROSTER, 1e6)).toEqual([MESSAGES, HUB, QUALIFIERS, RECRUITING, SETTINGS]);
    expect(sweepQueue(TABS, TABS, HOME, 1e6)).toEqual([]);
  });

  it('off the phone (no tabs) sweeps nothing', () => {
    renderHook(() => usePrefetchTabs([], HOME, SECTIONS));
    painted();
    idle();
    expect(router.prefetch).not.toHaveBeenCalled();
  });

  it('unmounting stops the sweep', () => {
    const view = renderHook(() => usePrefetchTabs(TABS, HOME, SECTIONS));
    painted();
    idle();
    view.unmount();
    router.prefetch.mockClear();
    advance(CH_SWEEP_GAP_MS * 4);
    idle();
    expect(router.prefetch).not.toHaveBeenCalled();
  });
});
