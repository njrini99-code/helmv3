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
import { render, screen } from '@testing-library/react';
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
