import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { CH_TAB_FRESH_MS, CH_TAB_HELD_MS, held, needsRefresh, resetPrefetchTabsForTests, usePrefetchTabs } from '../use-prefetch-tabs';

const HOME = '/golf/dashboard';
const CAL = '/golf/dashboard/calendar';
const STATS = '/golf/dashboard/stats';
const TABS = [HOME, CAL, STATS];

/** The idle callback (a timeout in jsdom), then two frames. */
const settle = () =>
  act(() => {
    vi.advanceTimersByTime(500);
  });
const twoFrames = () =>
  act(() => {
    vi.advanceTimersByTime(40);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  resetPrefetchTabsForTests();
  router.prefetch.mockClear();
  router.refresh.mockClear();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => vi.useRealTimers());

describe('usePrefetchTabs', () => {
  it('fetches the other tabs whole (a full prefetch, not just their skeleton) once the first page has painted', () => {
    renderHook(() => usePrefetchTabs(TABS, HOME));
    expect(router.prefetch).not.toHaveBeenCalled();
    twoFrames();
    expect(router.prefetch.mock.calls.map(([href]) => href)).toEqual([CAL, STATS]);
    for (const [, options] of router.prefetch.mock.calls) expect(options).toEqual({ kind: 'full' });
  });

  it('a tab reached within 30s of its fetch is shown as held: no refresh', () => {
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at), { initialProps: { at: HOME } });
    settle();
    vi.advanceTimersByTime(CH_TAB_FRESH_MS - 5000);
    view.rerender({ at: CAL });
    twoFrames();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('a tab held for more than 30s is shown at once, then refreshed in place after it paints, and the other tabs are fetched again behind it', () => {
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at), { initialProps: { at: HOME } });
    settle();
    vi.advanceTimersByTime(CH_TAB_FRESH_MS + 5000);
    router.prefetch.mockClear();
    view.rerender({ at: CAL });
    expect(router.refresh).not.toHaveBeenCalled();
    twoFrames();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(router.prefetch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(router.prefetch.mock.calls.map(([href]) => href)).toEqual([HOME, STATS]);
    // Those were fetched just now (the refresh dropped them), so the next switch needs no refresh.
    router.refresh.mockClear();
    view.rerender({ at: STATS });
    twoFrames();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('the first page is as old as the document: shown again more than 30s after the load, it is refreshed', () => {
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at), { initialProps: { at: CAL } });
    twoFrames();
    expect(router.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20_000);
    view.rerender({ at: HOME });
    settle();
    expect(router.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15_000);
    view.rerender({ at: CAL });
    twoFrames();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('a refreshed page keeps the time of its refresh once it is left: back to it more than 30s later, it is refreshed again', () => {
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at), { initialProps: { at: HOME } });
    settle();
    vi.advanceTimersByTime(CH_TAB_FRESH_MS + 10_000);
    view.rerender({ at: CAL });
    twoFrames();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    vi.advanceTimersByTime(20_000);
    view.rerender({ at: STATS });
    settle();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    view.rerender({ at: CAL });
    twoFrames();
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it('a page shown after its fetch is held 300s from the showing: fetched ahead then, it is not taken for new', () => {
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at), { initialProps: { at: HOME } });
    settle();
    vi.advanceTimersByTime(20_000);
    view.rerender({ at: CAL });
    settle();
    view.rerender({ at: HOME });
    settle();
    vi.advanceTimersByTime(CH_TAB_HELD_MS - 20_000);
    // Stats is past its hold: the switch fetches it itself, and Calendar is asked for again from there.
    view.rerender({ at: STATS });
    settle();
    expect(router.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    view.rerender({ at: CAL });
    twoFrames();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('a held page reached from outside the strip (Save for later, from the round) is refreshed whatever its age; a Back is not', () => {
    const ROUND = '/golf/dashboard/rounds/new';
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at, TABS), { initialProps: { at: HOME } });
    settle();
    view.rerender({ at: ROUND });
    settle();
    view.rerender({ at: CAL });
    twoFrames();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    view.rerender({ at: ROUND });
    settle();
    window.dispatchEvent(new PopStateEvent('popstate'));
    view.rerender({ at: CAL });
    twoFrames();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('off the phone (no tabs) asks for nothing and refreshes nothing', () => {
    const view = renderHook(({ at }) => usePrefetchTabs([], at), { initialProps: { at: HOME } });
    settle();
    vi.advanceTimersByTime(CH_TAB_FRESH_MS + 5000);
    view.rerender({ at: CAL });
    settle();
    expect(router.prefetch).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('fetches nothing ahead offline', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    renderHook(() => usePrefetchTabs(TABS, HOME));
    settle();
    expect(router.prefetch).not.toHaveBeenCalled();
  });
});

describe('usePrefetchTabs · the sections visited', () => {
  const ROSTER = '/golf/dashboard/roster';
  const SETTINGS = '/golf/dashboard/settings';
  const RECRUIT = '/golf/dashboard/recruiting';
  const SECTIONS = [...TABS, ROSTER, SETTINGS, RECRUIT];

  it('a section left is fetched whole for the way back', () => {
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at, SECTIONS), { initialProps: { at: HOME } });
    settle();
    view.rerender({ at: ROSTER });
    settle();
    router.prefetch.mockClear();
    view.rerender({ at: CAL });
    settle();
    expect(router.prefetch.mock.calls.map(([href]) => href)).toContain(ROSTER);
  });

  it('keeps only the last two visited', () => {
    const view = renderHook(({ at }) => usePrefetchTabs(TABS, at, SECTIONS), { initialProps: { at: HOME } });
    for (const at of [ROSTER, HOME, SETTINGS, HOME, RECRUIT, HOME]) {
      view.rerender({ at });
      settle();
    }
    router.prefetch.mockClear();
    view.rerender({ at: CAL });
    settle();
    const asked = router.prefetch.mock.calls.map(([href]) => href);
    expect(asked).toContain(RECRUIT);
    expect(asked).toContain(SETTINGS);
    expect(asked).not.toContain(ROSTER);
  });
});

describe('needsRefresh', () => {
  it('only a page held between 30s and Next’s 300s hold; past the hold the arrival fetched it itself', () => {
    expect(needsRefresh(undefined, undefined, 1e6)).toBe(false);
    expect(needsRefresh(null, undefined, 1e6)).toBe(false);
    expect(needsRefresh(1e6 - CH_TAB_FRESH_MS + 1, undefined, 1e6)).toBe(false);
    expect(needsRefresh(1e6 - CH_TAB_FRESH_MS - 1, undefined, 1e6)).toBe(true);
    expect(needsRefresh(1e6 - CH_TAB_HELD_MS - 1, undefined, 1e6)).toBe(false);
  });

  it('counts the hold from the last showing, and the age from the fetch', () => {
    expect(needsRefresh(1e6 - CH_TAB_HELD_MS - 10, 1e6 - 60_000, 1e6)).toBe(true);
    expect(held(1e6 - CH_TAB_HELD_MS - 10, 1e6 - 60_000, 1e6)).toBe(true);
    expect(held(1e6 - CH_TAB_HELD_MS - 10, undefined, 1e6)).toBe(false);
  });
});
