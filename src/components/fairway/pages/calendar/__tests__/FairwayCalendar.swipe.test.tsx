/**
 * FairwayCalendar — the schedule turns like a page on a phone.
 *
 * The phone masthead has no arrows: a horizontal touch swipe across the
 * schedule body steps the period (a swipe to the left asks for the NEXT
 * one, the way a page turns). Vertical drags, short flicks and mouse drags
 * leave the period alone. The coach's phone primary action is the floating
 * "+" rendered by the calendar itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

function renderCalendar(isCoach = false) {
  return render(
    <FairwayCalendar
      events={[]}
      teamMembers={[]}
      isCoach={isCoach}
      teamTimezone="America/New_York"
      upcomingCount={0}
      serverNow="2026-03-15T12:00:00.000Z"
      classOwnersResolved
    />,
  );
}

function swipe(body: HTMLElement, dx: number, dy: number, pointerType: 'touch' | 'mouse' = 'touch') {
  fireEvent.pointerDown(body, { pointerId: 1, pointerType, clientX: 300, clientY: 400 });
  fireEvent.pointerUp(body, { pointerId: 1, pointerType, clientX: 300 + dx, clientY: 400 + dy });
}

const title = () => screen.getByRole('heading', { level: 1 }).textContent ?? '';

describe('FairwayCalendar — page-turn swipe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a swipe to the left turns to the next month, a swipe to the right back', () => {
    renderCalendar();
    expect(title()).toContain('March 2026');
    swipe(screen.getByTestId('calendar-body'), -120, 8);
    expect(title()).toContain('April 2026');
    swipe(screen.getByTestId('calendar-body'), 120, -8);
    expect(title()).toContain('March 2026');
  });

  it('ignores a short flick, a vertical drag, and a mouse drag', () => {
    renderCalendar();
    const body = () => screen.getByTestId('calendar-body');
    swipe(body(), -40, 0);
    expect(title()).toContain('March 2026');
    swipe(body(), -120, 80);
    expect(title()).toContain('March 2026');
    swipe(body(), -120, 0, 'mouse');
    expect(title()).toContain('March 2026');
  });

  it('floats the coach\'s "New event" above the tab bar and gives a player none', () => {
    const { unmount } = renderCalendar(true);
    const floating = screen
      .getAllByRole('button', { name: 'New event' })
      .find((b) => b.className.includes('fixed'));
    expect(floating).toBeDefined();
    unmount();
    renderCalendar(false);
    expect(screen.queryByRole('button', { name: 'New event' })).not.toBeInTheDocument();
  });
});
