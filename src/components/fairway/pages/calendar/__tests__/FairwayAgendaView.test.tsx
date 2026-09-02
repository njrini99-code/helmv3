/**
 * FairwayAgendaView — anchor-to-today scroll (mustFix #3: "the event list
 * skips to an event 6 weeks in the past"). Range mode's window spans months
 * back and forward with no anchor, so the DOM's natural scroll position was
 * simply the top of the list — the oldest bucket in range. This regresses
 * that: opening/navigating the agenda must scroll the first at/after-today
 * bucket into view instead of leaving the viewport on stale history.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayAgendaView } from '../FairwayAgendaView';

function makeEvent(id: string, startIso: string, title = `Event ${id}`): CalendarEvent {
  return {
    id,
    team_id: 'team-1',
    title,
    event_type: 'practice',
    start_date: startIso,
    end_date: startIso,
    start_time: startIso,
    end_time: startIso,
    location: null,
    description: null,
  } as CalendarEvent;
}

// ---------------------------------------------------------------------------
// TIMEZONE-EXPLICIT FIXTURES.
//
// `bucketEvents` derives each bucket from `zonedMidnight(startStr, timezone)`,
// and with no `timezone` prop that falls back to DEFAULT_TIMEZONE
// ('America/New_York'). That is correct and deliberate — the comment in
// FairwayAgendaView.tsx explains it fixes a real React #418 hydration mismatch,
// where an event within ~4-5h of midnight ET bucketed differently between the
// SSR pass (Vercel, UTC) and the visitor's browser.
//
// The fixtures did not respect it. They built instants from LOCAL wall-clock
// strings (`new Date('2026-07-16T15:00:00').toISOString()`), so the day each
// event landed on in New York depended on the RUNNER's offset. At
// TZ=Pacific/Kiritimati (UTC+14), local 15:00 on the 16th is 21:00 ET on the
// 15th, so the "today" event stopped being today and the July 20 event bucketed
// as ET July 19 — producing exactly `expected 'Sunday, July 19' to be 'Today'`.
// Two of these four tests failed there and none failed at UTC-11, which is why it
// had never been noticed.
//
// The component was never wrong; the fixtures were. Fixed by stating the
// assumption instead of inheriting it:
//   - `timezone` is passed EXPLICITLY, so the test does not depend on the default
//   - event instants are explicit UTC (`Z`) chosen to sit at midday in that zone,
//     so no runner offset can slide one across a date boundary
//   - `nowRef` / range bounds stay LOCAL Dates, because that is what the
//     component compares them as (`isSameDay` against `new Date(y, m, d)`)
// ---------------------------------------------------------------------------
const TEAM_TZ = 'America/New_York';

/** Midday in TEAM_TZ, as an explicit UTC instant. 16:00Z = 12:00 EDT. */
const middayEt = (day: number): string => `2026-07-${String(day).padStart(2, '0')}T16:00:00.000Z`;

// Local Date, from parts — no string parsing, so no offset ambiguity.
const NOW = new Date(2026, 6, 16, 12, 0, 0);

describe('FairwayAgendaView — anchor scroll', () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoViewMock = vi.fn();
    // jsdom doesn't implement scrollIntoView at all — stub it so the
    // component's real guard (`typeof node.scrollIntoView === 'function'`)
    // takes the "call it" branch, and so we can assert on WHICH section it
    // targeted.
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });
  });

  it('does not scroll on load when earlier buckets are collapsed — today already heads the list', () => {
    const events = [
      // ~6 weeks before NOW, midday ET.
      makeEvent('stale', '2026-06-04T16:00:00.000Z', 'Old Practice'),
      makeEvent('today', middayEt(16), 'Today Practice'),
      makeEvent('future', middayEt(20), 'Upcoming Tournament'),
    ];

    render(
      <FairwayAgendaView
        events={events}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date(2026, 3, 16)}
        rangeEnd={new Date(2026, 9, 16)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={NOW}
      />,
    );

    // The stale bucket sits behind "Show 1 earlier event", so "Today" is the
    // first thing rendered. Scrolling it to the top of the viewport anyway
    // only pushed the calendar masthead off-screen — fresh loads landed
    // 130–386px down the page (audit 2026-09-02, UI-2/UI-3).
    expect(screen.getByRole('button', { name: /show 1 earlier event/i })).toBeInTheDocument();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('scrolls the today-or-later bucket into view when earlier buckets are visible above it and the range changes', () => {
    const events = [
      makeEvent('stale', '2026-06-04T16:00:00.000Z', 'Old Practice'),
      makeEvent('today', middayEt(16), 'Today Practice'),
      makeEvent('future', middayEt(20), 'Upcoming Tournament'),
    ];
    const view = (rangeStart: Date) => (
      <FairwayAgendaView
        events={events}
        mode="range"
        focusDate={NOW}
        rangeStart={rangeStart}
        rangeEnd={new Date(2026, 9, 16)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={NOW}
      />
    );
    const { rerender } = render(view(new Date(2026, 3, 16)));

    // Opening the history is a read, not a navigation — no yank.
    fireEvent.click(screen.getByRole('button', { name: /show 1 earlier event/i }));
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    // A genuine range change with history still open: "Today" is no longer
    // the first bucket, so it is anchored into view — past the stale one.
    rerender(view(new Date(2026, 2, 16)));
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
    const scrolledSection = scrollIntoViewMock.mock.instances[0] as unknown as HTMLElement;
    expect(scrolledSection.getAttribute('aria-label')).toBe('Today');
  });

  it('does not scroll for single-day mode', () => {
    render(
      <FairwayAgendaView
        events={[makeEvent('a', middayEt(16))]}
        mode="day"
        focusDate={NOW}
        timezone={TEAM_TZ}
        isCoach
        nowRef={NOW}
      />,
    );
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('does not scroll when every event in range is in the past (honest-empty all-past demo)', () => {
    const events = [makeEvent('old', '2026-06-04T16:00:00.000Z')];
    render(
      <FairwayAgendaView
        events={events}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date(2026, 3, 16)}
        rangeEnd={new Date(2026, 6, 1)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={NOW}
      />,
    );
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('does not re-scroll on a data-only refresh of the same navigation range', () => {
    const events = [
      makeEvent('stale', '2026-06-04T16:00:00.000Z', 'Old Practice'),
      makeEvent('today', middayEt(16)),
    ];
    const view = (rangeStart: Date, evs: CalendarEvent[]) => (
      <FairwayAgendaView
        events={evs}
        mode="range"
        focusDate={NOW}
        rangeStart={rangeStart}
        rangeEnd={new Date(2026, 9, 16)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={NOW}
      />
    );
    const { rerender } = render(view(new Date(2026, 3, 16), events));
    fireEvent.click(screen.getByRole('button', { name: /show 1 earlier event/i }));
    rerender(view(new Date(2026, 2, 16), events));
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    // Same nav range (mode/focusDate/rangeStart/rangeEnd unchanged), just a
    // new events array (e.g. a realtime refetch) — must NOT yank the scroll
    // position again mid-read.
    rerender(view(new Date(2026, 2, 16), [...events, makeEvent('new', middayEt(17))]));
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * The agenda showed a multi-day event only on its start day — the same gap
 * FairwayMonthGrid had, and the same one #1493 found in the ICS feeds. All
 * three read `start` and ignored `end_time`, which for an all-day event is the
 * INCLUSIVE last day the event runs.
 *
 * A coach opening the agenda on the Saturday of a four-day tournament saw
 * nothing scheduled. Production had 14 multi-day all-day events when this was
 * written (2026-08-17), all tournaments.
 */
describe('FairwayAgendaView — multi-day events appear on every day they run', () => {
  const INVITE = {
    id: 'invite',
    team_id: 'team-1',
    title: 'Transylvania Invite',
    event_type: 'tournament',
    all_day: true,
    // Production's storage shape: UTC midnight, inclusive end.
    start_date: '2026-09-03T00:00:00+00:00',
    end_date: '2026-09-06T00:00:00+00:00',
    start_time: '2026-09-03T00:00:00+00:00',
    end_time: '2026-09-06T00:00:00+00:00',
    location: null,
    description: null,
  } as unknown as CalendarEvent;

  it('day mode lists it on a middle day of the span', () => {
    const { container } = render(
      <FairwayAgendaView
        events={[INVITE]}
        mode="day"
        focusDate={new Date(2026, 8, 5)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={new Date(2026, 8, 5)}
      />,
    );
    expect(container.textContent).toContain('Transylvania Invite');
  });

  it('day mode lists it on the last day of the span', () => {
    const { container } = render(
      <FairwayAgendaView
        events={[INVITE]}
        mode="day"
        focusDate={new Date(2026, 8, 6)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={new Date(2026, 8, 6)}
      />,
    );
    expect(container.textContent).toContain('Transylvania Invite');
  });

  it('day mode does not list it the day after the span ends', () => {
    const { container } = render(
      <FairwayAgendaView
        events={[INVITE]}
        mode="day"
        focusDate={new Date(2026, 8, 7)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={new Date(2026, 8, 7)}
      />,
    );
    expect(container.textContent).not.toContain('Transylvania Invite');
  });

  it('range mode gives it a row in each of its four day buckets', () => {
    const { container } = render(
      <FairwayAgendaView
        events={[INVITE]}
        mode="range"
        focusDate={new Date(2026, 8, 1)}
        rangeStart={new Date(2026, 8, 1)}
        rangeEnd={new Date(2026, 8, 30)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={new Date(2026, 8, 1)}
      />,
    );
    const occurrences = (container.textContent ?? '').split('Transylvania Invite').length - 1;
    expect(occurrences).toBe(4);
  });

  it('range mode still lists a single-day event exactly once', () => {
    const { container } = render(
      <FairwayAgendaView
        events={[makeEvent('solo', middayEt(10), 'Team Photo Day')]}
        mode="range"
        focusDate={new Date(2026, 6, 1)}
        rangeStart={new Date(2026, 6, 1)}
        rangeEnd={new Date(2026, 6, 31)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={new Date(2026, 6, 1)}
      />,
    );
    const occurrences = (container.textContent ?? '').split('Team Photo Day').length - 1;
    expect(occurrences).toBe(1);
  });
});
