// =============================================================================
// src/app/baseball/(dashboard)/_components/hub-sub-nav.test.tsx
//
// #905 — pins the fix for "Operations"/"Postgame Review" tabs clipping past
// the viewport edge at 320/390px. `shrink-0` gave every tab the flex item's
// default `min-width: auto` floor (its full `whitespace-nowrap` label width),
// so even a hub capped at ≤3 tabs (Ruling 2) could exceed the viewport once
// icon + padding + a longer label were summed — and because
// `getBoundingClientRect` reflects LAYOUT position, not ancestor `overflow`
// clipping, the strip's own `overflow-x-auto` didn't hide the defect from a
// geometry-based clip check. This test locks in that tabs are shrinkable
// (`min-w-0`, not `shrink-0`) with a truncating label — same fix class as the
// FairwayBottomNav min-w-0 fix (#899).
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HubSubNav } from './hub-sub-nav';
import type { HubSubNavTab } from './hub-sub-nav';
import { IconUsers } from '@/components/icons';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/baseball/dashboard/roster'),
}));

const TABS: HubSubNavTab[] = [
  { id: 'roster', label: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { id: 'calendar', label: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconUsers },
  { id: 'operations', label: 'Operations', href: '/baseball/dashboard/operations', icon: IconUsers },
];

describe('HubSubNav — #905 shrinkable tabs', () => {
  it('does not pin tabs to shrink-0 (the min-width:auto floor that clipped past the viewport)', () => {
    const { container } = render(<HubSubNav tabs={TABS} ariaLabel="Team sections" />);
    const items = container.querySelectorAll('li');
    expect(items.length).toBeGreaterThan(0);
    for (const el of Array.from(items)) {
      expect((el as HTMLElement).className).not.toContain('shrink-0');
      expect((el as HTMLElement).className).toContain('min-w-0');
    }
  });

  it('truncates each tab label so it can shrink to fit instead of overflowing', () => {
    render(<HubSubNav tabs={TABS} ariaLabel="Team sections" />);
    const label = screen.getByText('Operations');
    expect(label.className).toContain('truncate');
    expect(label.className).toContain('min-w-0');
  });

  it('still renders every tab as a real link', () => {
    render(<HubSubNav tabs={TABS} ariaLabel="Team sections" />);
    expect(screen.getByRole('link', { name: /Operations/ })).toBeInTheDocument();
  });
});
