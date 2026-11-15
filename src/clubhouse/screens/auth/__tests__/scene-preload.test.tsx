import { act, cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner, 2026-11-12: "landing > sign in glitchy". The sign in opened on the daytime still and the painted course faded in
 * over it a beat later (the hour's sky at dusk: grey, then gold). The landing page now fetches the course while idle,
 * and the sign in renders it directly, in its first frame, with no fade-in. Nothing changes on a hard load.
 */
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
// The lazy path: what a hard load (or a sign in reached any other way) still goes through.
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="lazy-course" /> }));
// The chunk the landing page fetches.
vi.mock('../GolfScene', () => ({ GolfScene: () => <div className="ch-au-scene" data-testid="preloaded-course" /> }));

import { FixedClock } from '../use-hour';
import { SceneMount } from '../SceneMount';
import { preloadedScene } from '../scene-preload';
import { SignInScenePreload } from '../ScenePreload';

const at9 = new Date(2025, 9, 14, 9, 0);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Order matters: the preload is a module value for the tab, so the cases before it see none.
describe('the sign in without a preload (a hard load, or any other way in)', () => {
  it('draws the course through the lazy chunk, with its fade-in, and the server HTML has no instant mark', () => {
    expect(preloadedScene()).toBeNull();
    expect(renderToStaticMarkup(<SceneMount />)).not.toContain('data-instant');
    render(
      <FixedClock.Provider value={at9}>
        <SceneMount />
      </FixedClock.Provider>,
    );
    expect(screen.getByTestId('lazy-course')).toBeInTheDocument();
    expect(document.querySelector('.ch-au-poster')).not.toHaveAttribute('data-instant');
  });
});

describe('the landing page preloads the course, and the sign in draws it in its first frame', () => {
  it('fetches the chunk once the landing page is idle (a timer where Safari has no requestIdleCallback)', async () => {
    vi.useFakeTimers();
    render(<SignInScenePreload />);
    expect(preloadedScene()).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(preloadedScene()).not.toBeNull();
  });

  it('renders the preloaded course directly, not the lazy one, and marks the still so the course does not fade in', () => {
    render(
      <FixedClock.Provider value={at9}>
        <SceneMount />
      </FixedClock.Provider>,
    );
    expect(screen.getByTestId('preloaded-course')).toBeInTheDocument();
    expect(screen.queryByTestId('lazy-course')).toBeNull();
    expect(document.querySelector('.ch-au-poster')).toHaveAttribute('data-instant', '');
  });
});
