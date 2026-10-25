import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import type { ContextType } from 'react';
import { CH_ROWS_AHEAD, resetPrefetchTabsForTests, useIdleRowsAhead, usePressPrefetch } from '../use-prefetch-tabs';

/** Row 13 (A13 extension): the first few push rows on screen are fetched whole while the page is idle. */

const prefetch = vi.fn();
const router = { prefetch, push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() } as unknown as NonNullable<ContextType<typeof AppRouterContext>>;

/** jsdom has no IntersectionObserver: this one hands the test its callback and what it observes. */
let observed: Element[] = [];
let report: ((entries: Array<Pick<IntersectionObserverEntry, 'target' | 'isIntersecting' | 'boundingClientRect'>>) => void) | null = null;
class FakeIO {
  constructor(cb: (e: unknown[]) => void) {
    report = (entries) => cb(entries);
  }
  observe(el: Element) {
    observed.push(el);
  }
  disconnect() {}
  unobserve() {}
}

function Rows({ hrefs }: { hrefs: string[] }) {
  const press = usePressPrefetch();
  useIdleRowsAhead('/golf/dashboard/rounds');
  return (
    <ul>
      {hrefs.map((h) => (
        <li key={h}>
          <a href={h} {...press(h)}>
            {h}
          </a>
        </li>
      ))}
    </ul>
  );
}
const page = (hrefs: string[]) => (
  <AppRouterContext.Provider value={router}>
    <Rows hrefs={hrefs} />
  </AppRouterContext.Provider>
);
const idle = () => act(() => void vi.advanceTimersByTime(500));
const at = (top: number, left = 0) => ({ top, left }) as DOMRectReadOnly;
/** Tells the observer which rows are on screen, and where (rows listed out of reading order on purpose). */
const show = (onScreen: Record<string, number>) =>
  act(() =>
    report!(
      observed.map((target) => {
        const top = onScreen[target.getAttribute('data-ch-ahead')!];
        return { target, isIntersecting: top !== undefined, boundingClientRect: at(top ?? 2000) };
      }),
    ),
  );
const saveData = (on: boolean) => Object.defineProperty(navigator, 'connection', { configurable: true, value: on ? { saveData: true } : undefined });
const rows = ['/r/a', '/r/b', '/r/c', '/r/d', '/r/e'];

beforeEach(() => {
  resetPrefetchTabsForTests();
  prefetch.mockClear();
  observed = [];
  report = null;
  vi.stubGlobal('IntersectionObserver', FakeIO);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
});
afterEach(() => {
  cleanup();
  saveData(false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useIdleRowsAhead (row 13)', () => {
  it('on idle, fetches the top three rows on screen whole, in reading order; a row off screen is left to its press', () => {
    render(page(rows));
    expect(screen.getByText('/r/a').getAttribute('data-ch-ahead')).toBe('/r/a');
    expect(observed).toHaveLength(0);
    idle();
    expect(observed).toHaveLength(5);
    show({ '/r/d': 300, '/r/b': 100, '/r/a': 20, '/r/c': 200 });
    expect(CH_ROWS_AHEAD).toBe(3);
    expect(prefetch.mock.calls).toEqual([
      ['/r/a', { kind: PrefetchKind.FULL }],
      ['/r/b', { kind: PrefetchKind.FULL }],
      ['/r/c', { kind: PrefetchKind.FULL }],
    ]);
  });

  it('a row Next holds fresh (just pressed) is not fetched again', () => {
    render(page(rows));
    fireEvent.pointerDown(screen.getByText('/r/a'));
    expect(prefetch).toHaveBeenCalledTimes(1);
    idle();
    show({ '/r/a': 0, '/r/b': 100 });
    expect(prefetch.mock.calls.map((c) => c[0])).toEqual(['/r/a', '/r/b']);
  });

  it('Data Saver fetches nothing; CoachHelm rows are never fetched ahead (CH-R1)', () => {
    saveData(true);
    render(page(rows));
    idle();
    expect(observed).toHaveLength(0);
    cleanup();
    saveData(false);
    render(page(['/golf/dashboard/coachhelm?player=p1', '/r/a']));
    idle();
    show({ '/golf/dashboard/coachhelm?player=p1': 0, '/r/a': 100 });
    expect(prefetch.mock.calls.map((c) => c[0])).toEqual(['/r/a']);
  });

  it('a list that streams in after its skeleton is found at a later idle look', () => {
    const view = render(page([]));
    idle();
    expect(observed).toHaveLength(0);
    view.rerender(page(rows.slice(0, 2)));
    idle();
    expect(observed).toHaveLength(2);
  });
});
