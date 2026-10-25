import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import type { ContextType } from 'react';
import { parseFilter, statsHref, type ChFilter } from '../../data/stats-filter';
import { windowsAhead } from '../../screens/stats/window-ahead';
import { resetPrefetchTabsForTests, useIdleFetchAhead } from '../use-prefetch-tabs';

/** Row 15: once a Stats page settles, the windows either side are fetched whole when idle, so a switch shows at once. */

const prefetch = vi.fn();
const router = { prefetch, push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() } as unknown as NonNullable<ContextType<typeof AppRouterContext>>;

function Page({ hrefs }: { hrefs: string[] }) {
  useIdleFetchAhead(hrefs);
  return null;
}
const page = (hrefs: string[]) => (
  <AppRouterContext.Provider value={router}>
    <Page hrefs={hrefs} />
  </AppRouterContext.Provider>
);
const idle = () => act(() => void vi.advanceTimersByTime(500));
const saveData = (on: boolean) => Object.defineProperty(navigator, 'connection', { configurable: true, value: on ? { saveData: true } : undefined });

const base = '/golf/dashboard/stats';
const filter = (q: Record<string, string> = {}): ChFilter => parseFilter(q);
const hrefs = (f: ChFilter) => windowsAhead(f).map((n) => statsHref(base, n));

beforeEach(() => {
  resetPrefetchTabsForTests();
  prefetch.mockClear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
});
afterEach(() => {
  cleanup();
  saveData(false);
  vi.useRealTimers();
});

describe('the windows either side of the one shown (row 15)', () => {
  it('are the switch choices before and after it, keeping the rest of the filter; none under a custom range', () => {
    expect(hrefs(filter())).toEqual([`${base}?last=5`, `${base}?last=20`]);
    expect(hrefs(filter({ last: '5' }))).toEqual([base]);
    expect(hrefs(filter({ window: 'season', holes: 'all' }))).toEqual([`${base}?last=20&holes=all`, `${base}?window=qualifiers&holes=all`]);
    expect(hrefs(filter({ window: 'qualifiers' }))).toEqual([`${base}?window=season`]);
    expect(hrefs(filter({ from: '2026-09-01', to: '2026-10-01' }))).toEqual([]);
  });
});

describe('useIdleFetchAhead (row 15)', () => {
  it('fetches each page whole once the thread is idle, not before, and not again while Next holds it fresh', () => {
    const view = render(page(hrefs(filter())));
    expect(prefetch).not.toHaveBeenCalled();
    idle();
    expect(prefetch.mock.calls).toEqual([
      [`${base}?last=5`, { kind: PrefetchKind.FULL }],
      [`${base}?last=20`, { kind: PrefetchKind.FULL }],
    ]);
    // A switch to Last 20: its own neighbours; Last 10 is the page just shown, and Last 20's other side is the season.
    view.rerender(page(hrefs(filter({ last: '20' }))));
    idle();
    expect(prefetch.mock.calls.slice(2).map((c) => c[0])).toEqual([base, `${base}?window=season`]);
  });

  it('a change in flight passes none; Data Saver and CoachHelm fetch nothing', () => {
    render(page([]));
    idle();
    expect(prefetch).not.toHaveBeenCalled();
    cleanup();
    saveData(true);
    render(page(hrefs(filter())));
    idle();
    expect(prefetch).not.toHaveBeenCalled();
    cleanup();
    saveData(false);
    render(page(['/golf/dashboard/coachhelm?player=p1']));
    idle();
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('outside the app router it does nothing', () => {
    render(<Page hrefs={hrefs(filter())} />);
    idle();
    expect(prefetch).not.toHaveBeenCalled();
  });
});
