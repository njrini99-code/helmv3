/* eslint-disable jsx-a11y/aria-role -- role is a component prop (ClubhouseMarker, AliasWait), not an ARIA role */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-17: a route skeleton draws what the address already names (Calendar's `?view=`, Team Hub's `?tab=`, Settings'
 * `?section=`), never the default first, as StatsRouteSkeleton does for Stats.
 */
const query = vi.hoisted(() => ({ value: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query.value),
  usePathname: () => '/golf/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { CalendarRouteSkeleton, skeletonView } from '../screens/calendar/CalendarSkeleton';
import { HubRouteSkeleton } from '../screens/hub/HubSkeleton';
import { SettingsRouteSkeleton } from '../screens/settings/SettingsSkeleton';
import { ClubhouseMarker } from '../shell/context';

afterEach(() => {
  cleanup();
  query.value = '';
});

describe('Calendar route skeleton reads ?view= (GAP-S-17)', () => {
  it('maps the address as the route does: day, month and agenda, else the week', () => {
    expect(skeletonView('day')).toBe('day');
    expect(skeletonView('month')).toBe('month');
    expect(skeletonView('agenda')).toBe('agenda');
    expect(skeletonView('week')).toBe('week');
    expect(skeletonView('nonsense')).toBe('week');
    expect(skeletonView(null)).toBe('week');
  });

  it('draws the week with no view in the address', () => {
    const { container } = render(<CalendarRouteSkeleton />);
    expect(container.querySelector('.ch-cal-body')?.getAttribute('data-view')).toBe('week');
    expect(container.querySelector('.ch-mo')).toBeNull();
  });

  it('draws the month grid, on both widths, for ?view=month', () => {
    query.value = 'view=month';
    const { container } = render(<CalendarRouteSkeleton />);
    expect(container.querySelector('.ch-cal-body')?.getAttribute('data-view')).toBe('month');
    expect(container.querySelectorAll('.ch-mo__cell')).toHaveLength(35);
    expect(container.querySelector('.ch-calm-skel .ch-calm-month')).not.toBeNull();
    expect(container.querySelector('.ch-calm-skel__week')).toBeNull();
  });

  it('draws the list of days for ?view=agenda, with no week strip on the phone', () => {
    query.value = 'view=agenda';
    const { container } = render(<CalendarRouteSkeleton />);
    expect(container.querySelector('.ch-cal-body')?.getAttribute('data-view')).toBe('agenda');
    expect(container.querySelectorAll('.ch-ag__day').length).toBeGreaterThan(0);
    expect(container.querySelector('.ch-calm-skel__week')).toBeNull();
  });
});

describe('Team Hub route skeleton reads ?tab= (GAP-S-17)', () => {
  it('draws Home with no tab in the address', () => {
    const { container } = render(
      <ClubhouseMarker role="coach">
        <HubRouteSkeleton />
      </ClubhouseMarker>,
    );
    expect(container.querySelector('main')?.getAttribute('data-tab')).toBe('home');
    expect(container.querySelector('.ch-hb-bento')).not.toBeNull();
  });

  it.each(['tasks', 'travel', 'docs', 'ann'] as const)('draws the %s panel, not Home, for ?tab=%s', (tab) => {
    query.value = `tab=${tab}`;
    const { container } = render(
      <ClubhouseMarker role="coach">
        <HubRouteSkeleton />
      </ClubhouseMarker>,
    );
    expect(container.querySelector('main')?.getAttribute('data-tab')).toBe(tab);
    expect(container.querySelector('.ch-hb-bento')).toBeNull();
    expect(container.querySelectorAll(`[data-ch-skel-tab="${tab}"]`).length).toBe(2);
  });

  it('falls back to Home for a tab the address cannot name', () => {
    query.value = 'tab=nope';
    const { container } = render(<HubRouteSkeleton />);
    expect(container.querySelector('main')?.getAttribute('data-tab')).toBe('home');
  });
});

describe('Settings route skeleton reads ?section= (GAP-S-17)', () => {
  const rail = (c: HTMLElement) => c.querySelectorAll('.ch-set-rail__i');
  const marked = (c: HTMLElement) => Array.from(rail(c)).findIndex((el) => el.classList.contains('is-on'));

  it('marks Account and draws the phone list with no section in the address', () => {
    const { container } = render(
      <ClubhouseMarker role="coach">
        <SettingsRouteSkeleton />
      </ClubhouseMarker>,
    );
    expect(container.querySelector('main')?.getAttribute('data-section')).toBe('account');
    expect(marked(container)).toBe(0);
    expect(container.querySelector('.ch-setm-skel .ch-setm-id')).not.toBeNull();
    expect(container.querySelector('.ch-setm-skel')?.hasAttribute('data-opened')).toBe(false);
  });

  it('marks the section the address names and pushes it open on the phone', () => {
    query.value = 'section=notifications';
    const { container } = render(
      <ClubhouseMarker role="coach">
        <SettingsRouteSkeleton />
      </ClubhouseMarker>,
    );
    expect(container.querySelector('main')?.getAttribute('data-section')).toBe('notifications');
    expect(rail(container)[marked(container)]).toBeDefined();
    expect(marked(container)).toBeGreaterThan(0);
    expect(container.querySelector('.ch-setm-skel')?.hasAttribute('data-opened')).toBe(true);
    expect(container.querySelector('.ch-setm-skel .ch-setm-id')).toBeNull();
  });

  it("draws a route's own section (Notifications) without a query", () => {
    const { container } = render(
      <ClubhouseMarker role="player">
        <SettingsRouteSkeleton section="notifications" />
      </ClubhouseMarker>,
    );
    expect(container.querySelector('main')?.getAttribute('data-section')).toBe('notifications');
  });

  it("keeps a player off the coach's CoachHelm section and on the list", () => {
    const { container } = render(
      <ClubhouseMarker role="player">
        <SettingsRouteSkeleton section="coachhelm" />
      </ClubhouseMarker>,
    );
    expect(container.querySelector('main')?.getAttribute('data-section')).toBe('account');
    expect(container.querySelector('.ch-setm-skel')?.hasAttribute('data-opened')).toBe(false);
  });

  it("opens a coach's CoachHelm section from its route", () => {
    const { container } = render(
      <ClubhouseMarker role="coach">
        <SettingsRouteSkeleton section="coachhelm" />
      </ClubhouseMarker>,
    );
    expect(container.querySelector('main')?.getAttribute('data-section')).toBe('coachhelm');
    expect(container.querySelector('.ch-setm-skel')?.hasAttribute('data-opened')).toBe(true);
  });
});
