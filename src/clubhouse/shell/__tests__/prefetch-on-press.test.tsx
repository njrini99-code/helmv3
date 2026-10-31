import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A13: a finger landing on a row fetches its page whole, once; a second press within the fresh window does not fetch again. */

const prefetch = vi.fn();

import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import type { ContextType } from 'react';
import { CH_TAB_FRESH_MS, resetPrefetchTabsForTests, usePressPrefetch } from '../use-prefetch-tabs';

const router = { prefetch, push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() } as unknown as NonNullable<ContextType<typeof AppRouterContext>>;

function Link({ href }: { href: string }) {
  const press = usePressPrefetch();
  return (
    <a href={href} {...press(href)}>
      Theo
    </a>
  );
}
const Row = ({ href }: { href: string }) => (
  <AppRouterContext.Provider value={router}>
    <Link href={href} />
  </AppRouterContext.Provider>
);

beforeEach(() => {
  resetPrefetchTabsForTests();
  prefetch.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('prefetch on press (A13)', () => {
  it('pointerdown fetches the row page whole, once; again within the fresh window does nothing', () => {
    render(<Row href="/golf/dashboard/roster/theo" />);
    fireEvent.pointerDown(screen.getByText('Theo'));
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith('/golf/dashboard/roster/theo', { kind: PrefetchKind.FULL });
    act(() => vi.setSystemTime(Date.now() + 5_000));
    fireEvent.pointerDown(screen.getByText('Theo'));
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('outside the app router a press fetches nothing', () => {
    render(<Link href="/golf/dashboard/roster/theo" />);
    fireEvent.pointerDown(screen.getByText('Theo'));
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('marks the row the same with or without a router, so the server render and the hydrated client agree', () => {
    // The server renders client components without the app router: a mark drawn only with one was a hydration mismatch
    // React never patched, so the idle look (useIdleRowsAhead) found no rows.
    const { unmount } = render(<Link href="/golf/dashboard/roster/theo" />);
    expect(screen.getByText('Theo').getAttribute('data-ch-ahead')).toBe('/golf/dashboard/roster/theo');
    unmount();
    render(<Row href="/golf/dashboard/roster/theo" />);
    expect(screen.getByText('Theo').getAttribute('data-ch-ahead')).toBe('/golf/dashboard/roster/theo');
  });

  it('past the fresh window a press fetches it again', () => {
    render(<Row href="/golf/dashboard/roster/theo" />);
    fireEvent.pointerDown(screen.getByText('Theo'));
    act(() => vi.setSystemTime(Date.now() + CH_TAB_FRESH_MS + 1_000));
    fireEvent.pointerDown(screen.getByText('Theo'));
    expect(prefetch).toHaveBeenCalledTimes(2);
  });
});
