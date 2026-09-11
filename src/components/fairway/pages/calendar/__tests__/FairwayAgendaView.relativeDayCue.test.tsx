/**
 * FairwayAgendaView — `relativeDayCue` heading cue and the `periodLabel`
 * empty state, neither of which had a test.
 *
 * `relativeDayCue` (FairwayAgendaView.tsx ~L79) renders a quiet "in N days"
 * beside a day heading, but only for the two-through-six-days-out window —
 * Today/Tomorrow are already said by the heading itself, and anything eight+
 * days out is not "coming up soon" anymore. Its only past-facing case is
 * exactly one day back ("Yesterday"); anything further back gets no cue.
 * That is four off-by-one edges in a five-line function, which is exactly
 * where this kind of bug hides.
 *
 * Follows the fixture conventions from the sibling
 * FairwayAgendaView.test.tsx: an explicit IANA `timezone` on every event, UTC
 * ("Z") instants chosen at midday ET so no runner offset can slide one across
 * a date boundary, and a plain local `Date` for `nowRef` (never `new Date()`)
 * so the test's notion of "today" cannot drift with the real calendar or the
 * CI runner's timezone.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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

const TEAM_TZ = 'America/New_York';

/** Midday in TEAM_TZ, as an explicit UTC instant. 16:00Z = 12:00 EDT. */
const midEt = (julyDay: number): string => `2026-07-${String(julyDay).padStart(2, '0')}T16:00:00.000Z`;

// Friday, July 10 2026 — a local Date built from parts (no string parsing),
// with every fixture day below it inside the same month so no rollover can
// mask an off-by-one. `nowRef` is passed explicitly throughout; nothing here
// reads the real clock or depends on the runner's own timezone.
const NOW = new Date(2026, 6, 10, 12, 0, 0);

describe('FairwayAgendaView — relativeDayCue', () => {
  it('shows "in N days" only for 2–6 days out, and nothing on Today/Tomorrow or the 7-day boundary', () => {
    render(
      <FairwayAgendaView
        events={[
          makeEvent('d0', midEt(10), 'Today Event'),
          makeEvent('d1', midEt(11), 'Tomorrow Event'),
          makeEvent('d2', midEt(12), 'Plus Two Event'),
          makeEvent('d6', midEt(16), 'Plus Six Event'),
          makeEvent('d7', midEt(17), 'Plus Seven Event'),
        ]}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date(2026, 6, 1)}
        rangeEnd={new Date(2026, 6, 31)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={NOW}
      />,
    );

    // Today/Tomorrow already say it via the heading — no redundant cue.
    expect(
      within(screen.getByRole('region', { name: 'Today' })).queryByText(/in \d+ days?/i),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Tomorrow' })).queryByText(/in \d+ days?/i),
    ).not.toBeInTheDocument();

    // Inside the coming-week window, the cue names the exact day count.
    expect(
      within(screen.getByRole('region', { name: 'Sunday, July 12' })).getByText('in 2 days'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Thursday, July 16' })).getByText('in 6 days'),
    ).toBeInTheDocument();

    // Day 7 is the boundary where the cue must stop.
    expect(
      within(screen.getByRole('region', { name: 'Friday, July 17' })).queryByText(/in \d+ days?/i),
    ).not.toBeInTheDocument();
  });

  it('labels exactly one day back as "Yesterday", once the collapsed past section is opened', () => {
    render(
      <FairwayAgendaView
        events={[
          makeEvent('twoBack', midEt(8), 'Two Days Back Event'),
          makeEvent('yesterday', midEt(9), 'Yesterday Event'),
          makeEvent('today', midEt(10), 'Today Event'),
        ]}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date(2026, 6, 1)}
        rangeEnd={new Date(2026, 6, 31)}
        timezone={TEAM_TZ}
        isCoach
        nowRef={NOW}
      />,
    );

    // The two past days are collapsed by default (audit P-05) — open them first.
    fireEvent.click(screen.getByRole('button', { name: /show 2 earlier events/i }));

    expect(
      within(screen.getByRole('region', { name: 'Thursday, July 9' })).getByText('Yesterday'),
    ).toBeInTheDocument();

    // Two days back is NOT "exactly one day back" — the cue must not bleed
    // into every past day (a permissive `days <= -1` would still say
    // "Yesterday" here too).
    expect(
      within(screen.getByRole('region', { name: 'Wednesday, July 8' })).queryByText('Yesterday'),
    ).not.toBeInTheDocument();
  });
});

describe('FairwayAgendaView — periodLabel empty state', () => {
  it('names the empty period instead of a generic message when periodLabel is given', () => {
    render(
      <FairwayAgendaView
        events={[]}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date(2026, 8, 1)}
        rangeEnd={new Date(2026, 8, 30)}
        periodLabel="September 2026"
        timezone={TEAM_TZ}
        isCoach
        nowRef={NOW}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Nothing in September 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No upcoming events' })).not.toBeInTheDocument();
  });

  it('falls back to the generic empty copy when periodLabel is absent', () => {
    render(
      <FairwayAgendaView
        events={[]}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date(2026, 8, 1)}
        rangeEnd={new Date(2026, 8, 30)}
        isCoach
        nowRef={NOW}
      />,
    );

    expect(screen.getByRole('heading', { name: 'No upcoming events' })).toBeInTheDocument();
  });
});
