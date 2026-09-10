/**
 * FairwayCalendar — phone Month view is ONE stage, not two stacked cards.
 *
 * FairwayMonthOverview (the compact month) and FairwayAgendaView (the
 * selected day's rows) each carry their OWN `Surface elevation="border"`
 * (hairline + card-whisper shadow) since both are also used standalone
 * elsewhere — neither is edited here. FairwayCalendar instead wraps both in
 * its OWN Surface and neutralizes each child's own border/radius/shadow via
 * a `[data-slot=surface]` descendant override (every Surface renders that
 * attribute, so this reaches whichever of AgendaView's several return
 * branches is on screen), leaving one hairline seam between them.
 */
import { describe, it, expect, vi } from 'vitest';
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

function renderCalendar() {
  return render(
    <FairwayCalendar
      events={[]}
      teamMembers={[]}
      isCoach
      teamTimezone="America/New_York"
      upcomingCount={0}
      serverNow="2026-03-15T12:00:00.000Z"
      classOwnersResolved
    />,
  );
}

describe('FairwayCalendar — phone Month view fold', () => {
  it('wraps the compact month and the day rows in ONE Surface with the reset + hairline classes, not a plain gapped flex row', () => {
    const { container } = renderCalendar();
    // Two mastheads render (phone + desktop, CSS-gated) — the phone one's
    // Segmented is the first "Month" radio in DOM order.
    fireEvent.click(screen.getAllByRole('radio', { name: 'Month' })[0]!);

    const stage = container.querySelector('[data-slot="surface"].md\\:hidden');
    expect(stage).not.toBeNull();
    expect(stage!.className).not.toMatch(/\bgap-4\b/);
    expect(stage!.className).toContain('[&_[data-slot=surface]]:!border-0');
    expect(stage!.className).toContain('[&_[data-slot=surface]]:!rounded-none');
    expect(stage!.className).toContain('[&_[data-slot=surface]]:!shadow-none');
    expect(stage!.className).toContain('[&>*+*]:border-t');

    // Both children's own Surfaces are still present as DOM structure
    // (nested, not neutered) — just no longer the outermost edge.
    const nestedSurfaces = stage!.querySelectorAll('[data-slot="surface"]');
    expect(nestedSurfaces.length).toBe(2);
  });
});
