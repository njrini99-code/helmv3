/**
 * FairwayCalendar — Agenda view's fetch/render window.
 *
 * Agenda used to span a fixed ±3 months around the focused date, so a coach
 * landing on "March" saw January-through-May events mixed into one list. The
 * window is now scoped to exactly the focused month: [startOfMonth(focusDate),
 * endOfMonth(focusDate)]. This renders the real FairwayCalendar with a set of
 * events spread across five consecutive months and asserts the agenda list
 * (real FairwayAgendaView, unmocked) shows only the focused month's event —
 * the others are neither in the DOM nor counted in "Nothing in <month>".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayCalendar } from '../FairwayCalendar';

// Returns `initialEvents` regardless of the `visibleStart`/`visibleEnd` it is
// called with — deliberately, so this suite isolates the RENDER side of the
// window (what FairwayCalendar hands to FairwayAgendaView as rangeStart/
// rangeEnd, and what that real, unmocked component then buckets/shows) from
// the FETCH side (what range the hook itself is asked to load). Both derive
// from the same `visibleWindow` expression in FairwayCalendar, so this still
// covers the changed derivation; it does not separately assert the hook's
// call arguments.
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

function makeEvent(id: string, isoDate: string, title: string): CalendarEvent {
  return {
    id,
    team_id: 'team-1',
    title,
    event_type: 'practice',
    start_date: isoDate,
    end_date: isoDate,
    start_time: isoDate,
    end_time: isoDate,
    location: null,
    description: null,
    // Opts every fixture event out of the player's separate "Needs your
    // reply" nudge row, which intentionally scans ALL loaded events (not the
    // visible window) for the nearest un-RSVP'd one — unrelated to the
    // agenda window under test here, and would otherwise surface a
    // neighbouring month's title outside the agenda list and confound the
    // assertions below.
    requires_rsvp: false,
  };
}

// Five events, one per month, straddling the focused month on both sides —
// the exact shape that would have all shown together under the old ±3-month
// window. The March event sits AFTER `serverNow` (2026-03-15) so it renders
// as a normal upcoming bucket rather than through the separate "every visible
// bucket is past" all-past fallback — keeping the positive assertion honest
// about which mechanism is under test.
const events: CalendarEvent[] = [
  makeEvent('jan', '2026-01-15T18:00:00Z', 'January Practice'),
  makeEvent('feb', '2026-02-15T18:00:00Z', 'February Practice'),
  makeEvent('mar', '2026-03-20T18:00:00Z', 'March Practice'),
  makeEvent('apr', '2026-04-15T18:00:00Z', 'April Practice'),
  makeEvent('may', '2026-05-15T18:00:00Z', 'May Practice'),
];

function renderCalendar() {
  return render(
    <FairwayCalendar
      events={events}
      teamMembers={[]}
      isCoach={false}
      teamTimezone="America/New_York"
      upcomingCount={events.length}
      serverNow="2026-03-15T12:00:00.000Z"
      classOwnersResolved
    />,
  );
}

describe('FairwayCalendar — Agenda view window', () => {
  // The post-mount hydration effect nudges `focusDate` to the CLIENT's real
  // `new Date()` whenever it differs from the server-seeded day (by design —
  // see FairwayCalendar's "HYDRATION" note). Pin the client clock to the same
  // day as `serverNow` so the test observes the steady-state month window,
  // not a jump to whatever day the test happens to run on.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders only the focused month\'s event, not the ±3-month neighbours', () => {
    renderCalendar();

    expect(screen.getByText('March Practice')).toBeInTheDocument();
    // January/February are BEFORE serverNow, so even under the old ±3-month
    // window they'd be collapsed behind "Show N earlier events" rather than
    // rendered as visible text — these two lines pass under both the fixed
    // and the reverted window and do not by themselves discriminate the
    // window size. The assertion below (no earlier-events button at all)
    // is what actually pins the backward edge for this fixture; April/May
    // (AFTER serverNow, so never collapsible) are what pin the forward edge.
    expect(screen.queryByText('February Practice')).not.toBeInTheDocument();
    expect(screen.queryByText('January Practice')).not.toBeInTheDocument();
    expect(screen.queryByText('April Practice')).not.toBeInTheDocument();
    expect(screen.queryByText('May Practice')).not.toBeInTheDocument();
    // With the window correctly scoped to March alone, the only event in
    // range (March 20) is upcoming, so there is nothing to collapse and no
    // "Show N earlier events" affordance at all. Under the old ±3-month
    // window, January and February would be pulled in as past events and
    // this button would appear ("Show 2 earlier events") — this is the
    // assertion that actually catches a widened backward edge for this
    // fixture, since the two queries above stay silent either way.
    expect(screen.queryByRole('button', { name: /earlier event/i })).not.toBeInTheDocument();
  });

  // The honest-empty branch is driven by the SAME `visibleWindow` the list
  // itself is bucketed against (`totalEvents === 0` over the windowed
  // buckets). With every event a month or more away from the focused month,
  // the old ±3-month span would have pulled the February and April events
  // into view and this copy would never fire; the new exactly-the-month span
  // must report the focused month empty regardless of nearby events.
  it('reports the focused month empty when every event falls outside it', () => {
    const neighbourOnly: CalendarEvent[] = [
      makeEvent('feb', '2026-02-15T18:00:00Z', 'February Practice'),
      makeEvent('apr', '2026-04-15T18:00:00Z', 'April Practice'),
    ];

    render(
      <FairwayCalendar
        events={neighbourOnly}
        teamMembers={[]}
        isCoach={false}
        teamTimezone="America/New_York"
        upcomingCount={neighbourOnly.length}
        serverNow="2026-03-15T12:00:00.000Z"
        classOwnersResolved
      />,
    );

    expect(screen.getByText('Nothing in March 2026')).toBeInTheDocument();
    expect(screen.queryByText('February Practice')).not.toBeInTheDocument();
    expect(screen.queryByText('April Practice')).not.toBeInTheDocument();
  });

  // The past edge of the window, counted via the "Show N earlier events"
  // affordance's accessible name. Feb 20 sits entirely outside [Mar 1, Mar
  // 31] and must not be counted as an "earlier" event WITHIN March — that
  // only happens if the window has widened to include February again (the
  // old ±3-month span). Mar 5 (before serverNow) is the one genuinely
  // earlier event inside March; Mar 20 (after serverNow) is the one visible
  // upcoming event.
  it('counts only in-month days as "earlier", not a prior month pulled in by a wider window', () => {
    const straddlingPast: CalendarEvent[] = [
      makeEvent('feb20', '2026-02-20T18:00:00Z', 'February Practice'),
      makeEvent('mar5', '2026-03-05T18:00:00Z', 'Early March Practice'),
      makeEvent('mar20', '2026-03-20T18:00:00Z', 'Late March Practice'),
    ];

    render(
      <FairwayCalendar
        events={straddlingPast}
        teamMembers={[]}
        isCoach={false}
        teamTimezone="America/New_York"
        upcomingCount={straddlingPast.length}
        serverNow="2026-03-15T12:00:00.000Z"
        classOwnersResolved
      />,
    );

    expect(screen.getByRole('button', { name: 'Show 1 earlier event' })).toBeInTheDocument();
    expect(screen.getByText('Late March Practice')).toBeInTheDocument();
    expect(screen.queryByText('February Practice')).not.toBeInTheDocument();
  });
});
