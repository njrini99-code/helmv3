/**
 * FairwayDayStrip — timezone-aware density-dot bucketing.
 *
 * `start_date`/`start_time` are `timestamptz` (UTC on the wire). Bucketing an
 * event by a raw `.slice(0, 10)` of that ISO string reads the UTC calendar
 * date, which silently disagrees with the team-timezone date for any event
 * inside the UTC-offset window straddling midnight — a late-evening event's
 * density dot would render on the wrong day pill. `getZonedDateParts` (the
 * same explicit-timezone helper `zonedMidnight` uses for `focusDate`/
 * `nowRef`) fixes this; these tests pin the correct behavior and prove the
 * `teamTimezone` prop is actually consumed (not defaulted away).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayDayStrip } from '../FairwayDayStrip';

// A Sunday-start week covering Sun Jul 19 – Sat Jul 25, 2026 (local calendar
// fields — matches zonedMidnight's own constructor contract).
const FOCUS_DATE = new Date(2026, 6, 20); // Monday, July 20 2026 (local)
const SELECTED_DATE = FOCUS_DATE;
const NOW_REF = new Date(2026, 6, 15); // any date before the strip's week

function event(overrides: Partial<CalendarEvent> & { start_date: string }): CalendarEvent {
  return {
    id: 'ev-1',
    team_id: 'team-1',
    title: 'Practice',
    event_type: 'practice',
    end_date: null,
    start_time: overrides.start_date,
    end_time: null,
    ...overrides,
  };
}

describe('FairwayDayStrip — timezone-aware density bucketing', () => {
  it('buckets a late-evening ET event onto its ET calendar day, not the raw UTC date', () => {
    // 2026-07-20T23:30:00 America/New_York (EDT, UTC-4) === 2026-07-21T03:30:00Z.
    // A naive `.slice(0, 10)` of the UTC instant reads "2026-07-21" — the
    // WRONG day pill. The correct ET day is July 20.
    const events = [event({ start_date: '2026-07-21T03:30:00.000Z' })];

    render(
      <FairwayDayStrip
        focusDate={FOCUS_DATE}
        selectedDate={SELECTED_DATE}
        events={events}
        nowRef={NOW_REF}
        teamTimezone="America/New_York"
        onSelectDate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Monday, July 20 — 1 event' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tuesday, July 21 — no events' }),
    ).toBeInTheDocument();
  });

  it('changes which day pill the event lands on when teamTimezone changes', () => {
    // A single fixed instant: 2026-07-20T20:00:00Z.
    //   America/New_York (UTC-4): 16:00 local on Jul 20  → Jul 20 pill.
    //   Asia/Tokyo        (UTC+9): 05:00 local on Jul 21  → Jul 21 pill.
    const events = [event({ start_date: '2026-07-20T20:00:00.000Z' })];

    const { rerender } = render(
      <FairwayDayStrip
        focusDate={FOCUS_DATE}
        selectedDate={SELECTED_DATE}
        events={events}
        nowRef={NOW_REF}
        teamTimezone="America/New_York"
        onSelectDate={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Monday, July 20 — 1 event' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tuesday, July 21 — no events' }),
    ).toBeInTheDocument();

    rerender(
      <FairwayDayStrip
        focusDate={FOCUS_DATE}
        selectedDate={SELECTED_DATE}
        events={events}
        nowRef={NOW_REF}
        teamTimezone="Asia/Tokyo"
        onSelectDate={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Monday, July 20 — no events' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tuesday, July 21 — 1 event' }),
    ).toBeInTheDocument();
  });
});

/**
 * S1 — the strip IS the week navigation, and the swipe surface sits on top of
 * seven clickable day cells. That overlap is the whole hazard: a browser
 * synthesises a `click` on touchend, so without a movement guard a drag from
 * one cell to another would page the week AND select the cell it landed on,
 * leaving `selectedDate` and `focusDate` disagreeing after a single gesture.
 *
 * jsdom does not synthesise the click itself, so these tests fire it explicitly
 * — that IS the browser behaviour being pinned.
 */
describe('FairwayDayStrip — swipe pages the week without also picking a day', () => {
  function renderStrip() {
    const onSelectDate = vi.fn();
    const onNavigateWeek = vi.fn();
    render(
      <FairwayDayStrip
        focusDate={FOCUS_DATE}
        selectedDate={SELECTED_DATE}
        events={[]}
        nowRef={NOW_REF}
        teamTimezone="America/New_York"
        onSelectDate={onSelectDate}
        onNavigateWeek={onNavigateWeek}
      />,
    );
    return {
      onSelectDate,
      onNavigateWeek,
      track: screen.getByRole('group', { name: 'Week navigator' }),
      wednesday: screen.getByRole('button', { name: 'Wednesday, July 22 — no events' }),
      saturday: screen.getByRole('button', { name: 'Saturday, July 25 — no events' }),
    };
  }

  it('a leftward drag across cells pages to the next week and selects nothing', () => {
    const { track, wednesday, saturday, onNavigateWeek, onSelectDate } = renderStrip();

    fireEvent.touchStart(wednesday, { touches: [{ clientX: 200, clientY: 40 }] });
    fireEvent.touchMove(track, { touches: [{ clientX: 160, clientY: 42 }] });
    fireEvent.touchEnd(saturday, {
      touches: [],
      changedTouches: [{ clientX: 120, clientY: 44 }],
    });
    // The browser's synthesised tap, which the guard must swallow.
    fireEvent.click(saturday);

    expect(onNavigateWeek).toHaveBeenCalledWith('next');
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it('a rightward drag pages to the previous week', () => {
    const { track, wednesday, onNavigateWeek, onSelectDate } = renderStrip();

    fireEvent.touchStart(wednesday, { touches: [{ clientX: 120, clientY: 40 }] });
    fireEvent.touchMove(track, { touches: [{ clientX: 180, clientY: 41 }] });
    fireEvent.touchEnd(wednesday, {
      touches: [],
      changedTouches: [{ clientX: 200, clientY: 42 }],
    });
    fireEvent.click(wednesday);

    expect(onNavigateWeek).toHaveBeenCalledWith('prev');
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it('a mostly-vertical drag is a page scroll — it neither pages nor selects', () => {
    const { track, wednesday, onNavigateWeek, onSelectDate } = renderStrip();

    fireEvent.touchStart(wednesday, { touches: [{ clientX: 200, clientY: 40 }] });
    fireEvent.touchMove(track, { touches: [{ clientX: 190, clientY: 140 }] });
    fireEvent.touchEnd(wednesday, {
      touches: [],
      changedTouches: [{ clientX: 140, clientY: 240 }],
    });
    fireEvent.click(wednesday);

    expect(onNavigateWeek).not.toHaveBeenCalled();
    // The finger travelled, so it was never a tap either.
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it('a stationary tap still selects the day', () => {
    const { wednesday, onNavigateWeek, onSelectDate } = renderStrip();

    fireEvent.touchStart(wednesday, { touches: [{ clientX: 200, clientY: 40 }] });
    fireEvent.touchEnd(wednesday, {
      touches: [],
      changedTouches: [{ clientX: 202, clientY: 41 }],
    });
    fireEvent.click(wednesday);

    expect(onNavigateWeek).not.toHaveBeenCalled();
    expect(onSelectDate).toHaveBeenCalledTimes(1);
    expect(onSelectDate.mock.calls[0]?.[0]).toBeInstanceOf(Date);
  });

  it('a two-finger gesture never pages the week', () => {
    const { track, wednesday, onNavigateWeek } = renderStrip();

    fireEvent.touchStart(wednesday, {
      touches: [
        { clientX: 200, clientY: 40 },
        { clientX: 260, clientY: 44 },
      ],
    });
    fireEvent.touchMove(track, {
      touches: [
        { clientX: 120, clientY: 40 },
        { clientX: 300, clientY: 44 },
      ],
    });
    fireEvent.touchEnd(track, {
      touches: [{ clientX: 300, clientY: 44 }],
      changedTouches: [{ clientX: 120, clientY: 40 }],
    });

    expect(onNavigateWeek).not.toHaveBeenCalled();
  });

  it('renders as a plain picker (no paging) when no onNavigateWeek is given', () => {
    const onSelectDate = vi.fn();
    render(
      <FairwayDayStrip
        focusDate={FOCUS_DATE}
        selectedDate={SELECTED_DATE}
        events={[]}
        nowRef={NOW_REF}
        teamTimezone="America/New_York"
        onSelectDate={onSelectDate}
      />,
    );
    const wednesday = screen.getByRole('button', { name: 'Wednesday, July 22 — no events' });
    fireEvent.click(wednesday);
    expect(onSelectDate).toHaveBeenCalledTimes(1);
  });
});
