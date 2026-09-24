// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { GolfRouteRefresh, GOLF_PULL_TO_REFRESH_ROUTES } from '../GolfRouteRefresh';

describe('GolfRouteRefresh (NAV-R3)', () => {
  it('covers Home, Rounds, CoachHelm and Calendar only', () => {
    expect([...GOLF_PULL_TO_REFRESH_ROUTES].sort()).toEqual([
      '/golf/dashboard',
      '/golf/dashboard/calendar',
      '/golf/dashboard/coachhelm',
      '/golf/dashboard/rounds',
    ]);
  });

  it('adds no scroll container or transform around the page (document scrolling)', () => {
    const { container } = render(
      <GolfRouteRefresh pathname="/golf/dashboard">
        <p>page</p>
      </GolfRouteRefresh>,
    );
    const html = container.innerHTML;
    expect(html).not.toContain('overflow-y-auto');
    expect(html).not.toContain('translateY');
  });

  it('refreshes the route on a pull past the threshold', () => {
    Object.defineProperty(window, 'ontouchstart', { value: null, configurable: true });
    const { container } = render(
      <GolfRouteRefresh pathname="/golf/dashboard/rounds">
        <p>page</p>
      </GolfRouteRefresh>,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.touchStart(root, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(root, { touches: [{ clientX: 100, clientY: 150 }] });
    fireEvent.touchMove(root, { touches: [{ clientX: 102, clientY: 400 }] });
    fireEvent.touchEnd(root);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores a sideways swipe', () => {
    refresh.mockClear();
    const { container } = render(
      <GolfRouteRefresh pathname="/golf/dashboard/calendar">
        <p>page</p>
      </GolfRouteRefresh>,
    );
    const root = container.firstElementChild as HTMLElement;
    fireEvent.touchStart(root, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(root, { touches: [{ clientX: 200, clientY: 120 }] });
    fireEvent.touchMove(root, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(root);
    expect(refresh).not.toHaveBeenCalled();
  });
});
