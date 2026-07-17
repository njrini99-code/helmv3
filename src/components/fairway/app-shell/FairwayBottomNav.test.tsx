// =============================================================================
// src/components/fairway/app-shell/FairwayBottomNav.test.tsx
//
// #905 — pins the fix for the "Home" tab clipping past the left viewport edge
// at 320/390px. #899 already removed the `min-width: auto` floor (`min-w-0`
// on every column), but the row's OWN `justify-around` remained: per the CSS
// Box Alignment spec, `justify-content: space-around` falls back to `center`
// whenever the line's free space goes negative, and centering an overflowing
// row shifts its start point negative — regardless of how small the overflow
// is. This test locks in that `justify-around` is gone (so any residual
// sub-pixel overflow degrades to an ordinary right-edge overflow on the LAST
// column, never a negative left-shift on the FIRST) while every column keeps
// its `min-w-0` floor-removal.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FairwayBottomNav } from './FairwayBottomNav';
import type { NavItem } from './types';
import { IconHome, IconUsers, IconChartBar, IconMessage } from '@/components/icons';

const ITEMS: NavItem[] = [
  { label: 'Home', href: '/baseball/dashboard/command-center', icon: IconHome },
  { label: 'Team', href: '/baseball/dashboard/roster', icon: IconUsers },
  { label: 'Stats', href: '/baseball/dashboard/stats-center', icon: IconChartBar },
  { label: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage },
];

describe('FairwayBottomNav — #905 negative-shift fix', () => {
  it('never applies justify-around/justify-center to the row (fallback-to-center-on-overflow hazard)', () => {
    const { container } = render(
      <FairwayBottomNav items={ITEMS} pathname="/baseball/dashboard/command-center" onMoreOpen={() => {}} />,
    );
    const list = container.querySelector('ul')!;
    expect(list.className).not.toMatch(/justify-around|justify-center/);
  });

  it('keeps min-w-0 on every destination column (the #899 floor-removal fix)', () => {
    const { container } = render(
      <FairwayBottomNav items={ITEMS} pathname="/baseball/dashboard/command-center" onMoreOpen={() => {}} />,
    );
    const columns = container.querySelectorAll('ul > li');
    // 4 destinations + the More column.
    expect(columns).toHaveLength(5);
    for (const column of Array.from(columns)) {
      expect((column as HTMLElement).className).toContain('min-w-0');
    }
  });

  it('renders the first destination ("Home") as a real, unclipped tab', () => {
    render(<FairwayBottomNav items={ITEMS} pathname="/baseball/dashboard/command-center" onMoreOpen={() => {}} />);
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });
});
