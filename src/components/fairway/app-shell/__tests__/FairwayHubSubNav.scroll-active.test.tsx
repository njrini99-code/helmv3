/**
 * The active sub-tab must start in view. At 390px the player Team hub's 4th
 * tab (the page you are on) rendered clipped past the right edge as "Te…"
 * (screen walk-through 2026-09-24). jsdom has no layout, so the boxes are
 * stubbed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { FairwayHubSubNav } from '@/components/fairway/app-shell/FairwayHubSubNav';
import type { GolfSubTab } from '@/lib/golf/nav-registry';

vi.mock('next/navigation', () => ({ usePathname: () => '/golf/dashboard/team' }));
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: React.ReactNode }) => <span {...rest}>{children}</span>,
    },
  ),
  useReducedMotion: () => true,
}));

const tabs: GolfSubTab[] = [
  { id: 'hub', label: 'Team Hub', href: '/golf/dashboard/team-hub' },
  { id: 'quals', label: 'My Qualifiers', href: '/golf/dashboard/my-qualifiers' },
  { id: 'roster', label: 'Roster', href: '/golf/dashboard/roster' },
  { id: 'team', label: 'Team', href: '/golf/dashboard/team' },
] as GolfSubTab[];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function box(left: number, right: number): DOMRect {
  return { left, right, top: 0, bottom: 40, width: right - left, height: 40, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
}

describe('FairwayHubSubNav — active tab scrolls into view', () => {
  it('scrolls the strip so a clipped active tab is fully visible', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'UL') return box(0, 390);
      if (this.getAttribute('href') === '/golf/dashboard/team') return box(340, 430);
      return box(0, 100);
    });
    const { container } = render(<FairwayHubSubNav tabs={tabs} ariaLabel="Team sections" />);
    const list = container.querySelector('ul')!;
    expect(list.scrollLeft).toBe(430 - 390 + 16);
  });

  it('leaves the strip alone when the active tab already fits', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'UL') return box(0, 390);
      return box(10, 100);
    });
    const { container } = render(<FairwayHubSubNav tabs={tabs} ariaLabel="Team sections" />);
    expect(container.querySelector('ul')!.scrollLeft).toBe(0);
  });
});
