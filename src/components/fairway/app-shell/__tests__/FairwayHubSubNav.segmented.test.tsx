/**
 * The Schedule hub's strip is the large depth toggle (owner 2026-09-27).
 *
 * The shell hands `FairwayHubSubNav` the hub's own tabs array; the Schedule
 * hub's array is registered in `SEGMENTED_HUB_TABS`, so its strip renders the
 * segmented recipe (sunken track, green pill) while every other hub keeps the
 * underline tabs. The segmented strip is taller than the 2.5rem the shell
 * assumes, so it publishes its own height on the shell column and restores
 * the shell's value when it goes away.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FairwayHubSubNav } from '@/components/fairway/app-shell/FairwayHubSubNav';
import { GOLF_COACH_HUBS } from '@/lib/golf/nav-registry';

let pathname = '/golf/dashboard/qualifiers/abc';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

const schedule = GOLF_COACH_HUBS.find((h) => h.id === 'schedule')!;
const team = GOLF_COACH_HUBS.find((h) => h.id === 'team')!;

function renderInShell(tabs: typeof schedule.tabs, ariaLabel: string) {
  const host = document.createElement('div');
  host.style.setProperty('--fw-hub-subnav-offset', '2.5rem');
  document.body.appendChild(host);
  const result = render(<FairwayHubSubNav tabs={tabs} ariaLabel={ariaLabel} />, { container: host });
  return { host, ...result };
}

describe('FairwayHubSubNav — segmented Schedule strip', () => {
  it('renders the Schedule hub as the segmented toggle, with the page link current', () => {
    pathname = '/golf/dashboard/qualifiers/abc';
    renderInShell(schedule.tabs, schedule.ariaLabel);
    const nav = screen.getByRole('navigation', { name: schedule.ariaLabel });
    expect(nav).toHaveAttribute('data-variant', 'segmented');
    expect(screen.getByRole('link', { name: 'Qualifiers' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Calendar' })).not.toHaveAttribute('aria-current');
    // The pill rides the active link only.
    expect(screen.getByRole('link', { name: 'Qualifiers' }).querySelector('[data-slot="fw-segment-pill"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Travel' }).querySelector('[data-slot="fw-segment-pill"]')).toBeNull();
  });

  it('keeps the underline strip for every other hub', () => {
    pathname = '/golf/dashboard/messages';
    renderInShell(team.tabs, team.ariaLabel);
    expect(screen.getByRole('navigation', { name: team.ariaLabel })).not.toHaveAttribute('data-variant');
  });

  it('publishes its own height on the shell column and restores the shell value on unmount', () => {
    pathname = '/golf/dashboard/calendar';
    const { host, unmount } = renderInShell(schedule.tabs, schedule.ariaLabel);
    expect(host.style.getPropertyValue('--fw-hub-subnav-offset')).toMatch(/^\d+px$/);
    unmount();
    expect(host.style.getPropertyValue('--fw-hub-subnav-offset')).toBe('2.5rem');
  });
});
