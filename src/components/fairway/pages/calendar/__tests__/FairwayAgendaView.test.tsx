/**
 * FairwayAgendaView — anchor-to-today scroll (mustFix #3: "the event list
 * skips to an event 6 weeks in the past"). Range mode's window spans months
 * back and forward with no anchor, so the DOM's natural scroll position was
 * simply the top of the list — the oldest bucket in range. This regresses
 * that: opening/navigating the agenda must scroll the first at/after-today
 * bucket into view instead of leaving the viewport on stale history.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
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

  it('scrolls the today-or-later bucket into view, past a six-week-old stale bucket', () => {
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

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
    // The scrolled-to section is the "Today" bucket, not the stale one.
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
    const events = [makeEvent('today', middayEt(16))];
    const { rerender } = render(
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
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    // Same nav range (mode/focusDate/rangeStart/rangeEnd unchanged), just a
    // new events array (e.g. a realtime refetch) — must NOT yank the scroll
    // position again mid-read.
    rerender(
      <FairwayAgendaView
        events={[...events, makeEvent('new', middayEt(17))]}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date(2026, 3, 16)}
        rangeEnd={new Date(2026, 9, 16)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={NOW}
      />,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });
});
