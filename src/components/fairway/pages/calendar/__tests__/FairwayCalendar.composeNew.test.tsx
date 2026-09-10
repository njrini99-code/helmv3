/**
 * FairwayCalendar — `?new=1` deep-link auto-compose.
 *
 * The coach-home "New event" link points at `/golf/dashboard/calendar?new=1`
 * so the create editor opens on arrival instead of landing on the general
 * hub. It opens the SAME editor the masthead's own primary action opens (no
 * separate create surface), fires once, and strips `new` from the URL via
 * router.replace (preserving any other query params) so a refresh never
 * reopens it. A player following the same link gets no editor (they cannot
 * create events) but the param is still stripped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayCalendar } from '../FairwayCalendar';

vi.mock('@/hooks/golf/use-calendar-range-events', () => ({
  useCalendarRangeEvents: ({ initialEvents }: { initialEvents: CalendarEvent[] }) => ({
    events: initialEvents,
    isLoadingRange: false,
    rangeError: null,
    retryRange: vi.fn(),
    refetchVisibleRange: vi.fn(),
  }),
}));

vi.mock('@/contexts/notification-badge-context', () => ({
  useNotificationBadges: () => ({
    announcements: 0,
    tasks: 0,
    messages: 0,
    travel: 0,
    calendarNotifications: 0,
    coachhelm: 0,
    notificationsUnread: 0,
    total: 0,
    unseenAnnouncements: [],
    hasUnseenAnnouncements: false,
    markAnnouncementsSeen: vi.fn(),
  }),
}));

const replace = vi.fn();
let searchParamsString = 'new=1';
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/golf/dashboard/calendar',
  useSearchParams: () => new URLSearchParams(searchParamsString),
  useParams: () => ({}),
}));

function renderCalendar(overrides: Partial<React.ComponentProps<typeof FairwayCalendar>> = {}) {
  return render(
    <FairwayCalendar
      events={[]}
      teamMembers={[]}
      isCoach
      teamTimezone="America/New_York"
      upcomingCount={0}
      serverNow="2026-03-15T12:00:00.000Z"
      classOwnersResolved
      initialComposeNew
      {...overrides}
    />,
  );
}

describe('FairwayCalendar — ?new=1 auto-compose', () => {
  beforeEach(() => {
    replace.mockClear();
    searchParamsString = 'new=1';
  });

  it('opens the create editor for a coach', () => {
    renderCalendar();
    expect(screen.getByRole('dialog', { name: 'New event' })).toBeInTheDocument();
  });

  it('strips `new` from the URL via router.replace, preserving other params', () => {
    searchParamsString = 'new=1&event=abc123';
    renderCalendar();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/golf/dashboard/calendar?event=abc123', { scroll: false });
  });

  it('replaces with the bare path when `new` was the only param', () => {
    renderCalendar();
    expect(replace).toHaveBeenCalledWith('/golf/dashboard/calendar', { scroll: false });
  });

  it('does not open an editor for a player, but still strips the param', () => {
    renderCalendar({ isCoach: false });
    expect(screen.queryByRole('dialog', { name: 'New event' })).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('does nothing when `initialComposeNew` is not set', () => {
    renderCalendar({ initialComposeNew: false });
    expect(screen.queryByRole('dialog', { name: 'New event' })).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
