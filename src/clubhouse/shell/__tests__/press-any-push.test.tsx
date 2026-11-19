import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import type { ContextType } from 'react';
import { CH_SHAPES_LEARNT, resetPrefetchTabsForTests, useIdleRowsAhead } from '../use-prefetch-tabs';

/**
 * E-1 (audit 2026-11-19): every link on the page that opens another page is fetched as the finger lands, and the page's
 * first rows teach Next their route shape as the page paints, so a tap commits at once instead of waiting on the server.
 */

const prefetch = vi.fn();
const router = { prefetch, push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() } as unknown as NonNullable<ContextType<typeof AppRouterContext>>;

function Shell({ children, path = '/golf/dashboard/practice' }: { children: React.ReactNode; path?: string }) {
  useIdleRowsAhead(path);
  return <div id="ch-content">{children}</div>;
}
const wrap = (ui: React.ReactNode, path?: string) => (
  <AppRouterContext.Provider value={router}>
    <Shell path={path}>{ui}</Shell>
  </AppRouterContext.Provider>
);
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
};

beforeEach(() => {
  resetPrefetchTabsForTests();
  prefetch.mockClear();
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a press on any link to another page (E-1)', () => {
  it('fetches the page whole as the pointer goes down', () => {
    render(wrap(<a href="/golf/dashboard/practice/format">Plan format</a>));
    fireEvent.pointerDown(screen.getByText('Plan format'), { button: 0 });
    expect(prefetch).toHaveBeenCalledWith('/golf/dashboard/practice/format', { kind: PrefetchKind.FULL });
  });

  it('leaves the page showing, other sites, new tabs and CoachHelm alone', () => {
    render(
      wrap(
        <>
          <a href="/golf/dashboard/practice">Here</a>
          <a href="https://example.com/x">Away</a>
          <a href="/golf/dashboard/rounds/1" target="_blank">Tab</a>
          <a href="/golf/dashboard/coachhelm?view=player&player=p1">Mason</a>
        </>,
      ),
    );
    for (const t of ['Here', 'Away', 'Tab', 'Mason']) fireEvent.pointerDown(screen.getByText(t), { button: 0 });
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('leaves a row with its own press handler to it (data-ch-ahead)', () => {
    render(wrap(<a href="/golf/dashboard/rounds/r1" data-ch-ahead="/golf/dashboard/rounds/r1">Row</a>));
    prefetch.mockClear();
    fireEvent.pointerDown(screen.getByText('Row'), { button: 0 });
    expect(prefetch).not.toHaveBeenCalled();
  });
});

describe('the first rows teach Next their route as the page paints (E-1)', () => {
  it('one default prefetch per route shape, never CoachHelm', async () => {
    render(
      wrap(
        <>
          <a href="/golf/dashboard/rounds/r1?from=rounds" data-ch-ahead="/golf/dashboard/rounds/r1?from=rounds">1</a>
          <a href="/golf/dashboard/rounds/r2?from=rounds" data-ch-ahead="/golf/dashboard/rounds/r2?from=rounds">2</a>
          <a href="/golf/dashboard/qualifiers/q1" data-ch-ahead="/golf/dashboard/qualifiers/q1">3</a>
          <a href="/golf/dashboard/coachhelm?view=player" data-ch-ahead="/golf/dashboard/coachhelm?view=player">4</a>
        </>,
        '/golf/dashboard/rounds',
      ),
    );
    await frames(3);
    const learnt = prefetch.mock.calls.filter((c) => c.length === 1).map((c) => c[0]);
    expect(learnt).toEqual(['/golf/dashboard/rounds/r1?from=rounds', '/golf/dashboard/qualifiers/q1']);
    expect(learnt.length).toBeLessThanOrEqual(CH_SHAPES_LEARNT);
  });
});
