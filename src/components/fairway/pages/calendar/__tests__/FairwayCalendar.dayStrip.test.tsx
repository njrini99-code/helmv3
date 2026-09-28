/**
 * FairwayCalendar — a day-strip tap moves the Day grid.
 *
 * The Day view's week strip is the picker: tapping another day re-heads the
 * time grid under it ("Yesterday", "Tomorrow", or the weekday) and marks that
 * day pressed. The calendar opens on today's grid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

// Monday Sep 28 2026, noon ET.
const NOW = '2026-09-28T16:00:00.000Z';

describe('FairwayCalendar — day strip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-heads the Day grid when another day is tapped', () => {
    render(
      <FairwayCalendar
        events={[]}
        teamMembers={[]}
        isCoach={false}
        teamTimezone="America/New_York"
        upcomingCount={0}
        serverNow={NOW}
        classOwnersResolved
      />,
    );
    const strip = () => within(screen.getByRole('group', { name: 'Week navigator' }));
    expect(screen.getByTestId('day-time-grid')).toHaveAccessibleName("Today's schedule");

    fireEvent.click(strip().getByRole('button', { name: /^Sunday, September 27/ }));
    expect(screen.getByTestId('day-time-grid')).toHaveAccessibleName("Yesterday's schedule");
    expect(strip().getByRole('button', { name: /^Sunday, September 27/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(strip().getByRole('button', { name: /^Wednesday, September 30/ }));
    expect(screen.getByTestId('day-time-grid')).toHaveAccessibleName("Wednesday's schedule");
  });
});
