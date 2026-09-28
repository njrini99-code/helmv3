/**
 * FairwayMonthGrid — month-cell event chip layout (finding #86: day cells
 * showed a meaningless single-character-plus-ellipsis chip instead of a real
 * abbreviated title).
 *
 * jsdom doesn't lay out flexbox/text-overflow, so this is a class-contract
 * test: the chip's title text must live in its OWN shrinkable
 * (`min-w-0 flex-1`) truncate span, separate from the fixed-width time badge
 * (`flex-shrink-0`), with the row itself laid out as a real flex container
 * (`flex` + `min-w-0`) rather than `block` fighting the Button's own
 * `inline-flex` base — the combination that squeezed the title to one
 * character before.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayMonthGrid, layoutMonthWeek, monthLaneCapacity } from '../FairwayMonthGrid';
import { tintFor } from '../FairwayCalendarMemberRail';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    team_id: 'team-1',
    title: 'Tuesday Qualifier Round',
    event_type: 'qualifier',
    start_date: '2026-07-14T15:00:00Z',
    end_date: '2026-07-14T17:00:00Z',
    start_time: '2026-07-14T15:00:00Z',
    end_time: '2026-07-14T17:00:00Z',
    location: null,
    description: null,
    all_day: false,
    ...overrides,
  } as CalendarEvent;
}

describe('FairwayMonthGrid — event chip layout', () => {
  it('renders the full event title in its own shrinkable truncate span, not fused with the time badge', () => {
    render(
      <FairwayMonthGrid
        events={[makeEvent()]}
        focusDate={new Date('2026-07-16T12:00:00')}
        nowRef={new Date('2026-07-16T12:00:00')}
        timezone="America/New_York"
      />,
    );
    const chip = screen.getByTitle('Tuesday Qualifier Round');
    const titleSpan = chip.querySelector('span.truncate');
    expect(titleSpan).not.toBeNull();
    expect(titleSpan?.textContent).toBe('Tuesday Qualifier Round');
    expect(titleSpan?.className).toContain('min-w-0');
    expect(titleSpan?.className).toContain('flex-1');
    // The row itself is a real flex row with min-w-0 (not `block`, which
    // fights the Button's own `inline-flex` base and left almost no
    // measurable width for the title before truncating it to one glyph).
    expect(chip.className).toContain('flex');
    expect(chip.className).toContain('min-w-0');
  });

  // A coach looking at a full month sees every player's class meetings side by
  // side. Before attribution they were all the same neutral chip with nothing
  // saying whose was whose ("if I'm looking at a full calendar how do I know
  // who is who?", 2026-08-05).
  it("wears the owning player's identity color and initials on a class chip", () => {
    render(
      <FairwayMonthGrid
        events={[
          makeEvent({
            id: 'cls-evt',
            title: 'BUS 324: Marketing Management',
            event_type: 'class',
            owner_player_id: 'p-braeden',
            owner_label: 'Braeden G.',
            owner_initials: 'BG',
          }),
        ]}
        focusDate={new Date('2026-07-16T12:00:00')}
        nowRef={new Date('2026-07-16T12:00:00')}
        timezone="America/New_York"
      />,
    );

    // The tooltip names the owner outright.
    const chip = screen.getByTitle('Braeden G. — BUS 324: Marketing Management');
    expect(chip.textContent).toContain('BG');
    // Tinted from the player's id, NOT the generic event-type tone — that tint
    // is the same one their avatar wears in the member rail and on the roster.
    const owner = tintFor('p-braeden');
    expect(chip.style.getPropertyValue('--ev-fill')).toContain(owner.bg);
    expect(chip.style.getPropertyValue('--ev-ink')).toBe(owner.text);
  });

  it('leaves a team event on its event-type tone, with no owner marks', () => {
    render(
      <FairwayMonthGrid
        events={[makeEvent({ title: 'Team Practice', event_type: 'practice' })]}
        focusDate={new Date('2026-07-16T12:00:00')}
        nowRef={new Date('2026-07-16T12:00:00')}
        timezone="America/New_York"
      />,
    );

    const chip = screen.getByTitle('Team Practice');
    expect(chip.getAttribute('style')).toBeNull();
    // The practice fill and ink, as classes: the same values the Day block paints.
    expect(chip.className).toContain('[--ev-ink:var(--fw-tint-1-ink)]');
    expect(chip.textContent).not.toContain('BG');
  });
});

/**
 * A multi-day event occupied exactly ONE cell — its start day.
 *
 * `byDay` pushed each event once, keyed on `eventCalendarDay(start)`, and never
 * looked at `end_time`. The editor lets a coach set an End Date and renders the
 * result back as an inclusive span ("Sep 3 → Sep 6" in `SpanSummary`), so the
 * two surfaces disagreed: a coach opening the month grid on Saturday during the
 * Transylvania Invite (Sep 3–6) saw an empty day.
 *
 * Production had 14 multi-day all-day events when this was written
 * (2026-08-17), every one of them a tournament — Sep 3–6, Sep 13–15, May 8–16.
 * These are the weeks a coach is most likely to be checking the calendar.
 *
 * Found alongside #1493, which was the same inclusive-vs-exclusive end date
 * reaching the ICS feeds wrong. Different surface, same neglected column.
 */
describe('FairwayMonthGrid — multi-day events span every day they run', () => {
  /**
   * The placed items covering a day. A multi-day event is ONE bar per week
   * row (2026-09-27 redesign), so "shows on the 4th" means a bar whose
   * covered days include the 4th, not a chip inside the 4th's cell.
   */
  function itemsOn(dayKey: string, title: string): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(`[data-days~="${dayKey}"]`)).filter((el) =>
      (el.getAttribute('title') ?? '').includes(title),
    );
  }

  const invite = makeEvent({
    id: 'evt-invite',
    title: 'Transylvania Invite',
    event_type: 'tournament',
    all_day: true,
    // Stored exactly as production stores an all-day event: UTC midnight, with
    // end_time the INCLUSIVE last day.
    start_date: '2026-09-03T00:00:00+00:00',
    end_date: '2026-09-06T00:00:00+00:00',
    start_time: '2026-09-03T00:00:00+00:00',
    end_time: '2026-09-06T00:00:00+00:00',
  });

  function renderSeptember() {
    render(
      <FairwayMonthGrid
        events={[invite]}
        focusDate={new Date(2026, 8, 15)}
        nowRef={new Date(2026, 8, 15)}
        timezone="America/New_York"
      />,
    );
  }

  it('shows the tournament on every day from the 3rd through the 6th', () => {
    renderSeptember();
    for (const day of ['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']) {
      expect(itemsOn(day, 'Transylvania Invite').length, day).toBe(1);
    }
  });

  it('is one bar per week row: Thu–Sat, then Sunday continuing from the week before', () => {
    renderSeptember();
    const bars = screen.getAllByTitle('Transylvania Invite');
    expect(bars.map((b) => b.getAttribute('data-days'))).toEqual([
      '2026-09-03 2026-09-04 2026-09-05',
      '2026-09-06',
    ]);
    expect(bars[0]).toHaveAccessibleName(/Transylvania Invite, Tournament, all day, Thursday, September 3 to Sunday, September 6/);
  });

  it('does not bleed onto the day before or the day after', () => {
    renderSeptember();
    for (const day of ['2026-09-02', '2026-09-07']) {
      expect(itemsOn(day, 'Transylvania Invite').length, day).toBe(0);
    }
  });

  it('still shows a single-day event exactly once', () => {
    render(
      <FairwayMonthGrid
        events={[
          makeEvent({
            id: 'evt-single',
            title: 'Team Photo Day',
            all_day: true,
            start_date: '2026-09-10T00:00:00+00:00',
            end_date: '2026-09-10T00:00:00+00:00',
            start_time: '2026-09-10T00:00:00+00:00',
            end_time: '2026-09-10T00:00:00+00:00',
          }),
        ]}
        focusDate={new Date(2026, 8, 15)}
        nowRef={new Date(2026, 8, 15)}
        timezone="America/New_York"
      />,
    );
    expect(screen.getAllByTitle(/Team Photo Day/).length).toBe(1);
  });

  it('does not span a TIMED event that merely crosses midnight in another zone', () => {
    // A 3pm–5pm practice is one day's event. Its end instant must not be read
    // as a second calendar day just because a zone conversion pushes it over
    // midnight — `eventCalendarDay` handles that, and this pins it.
    render(
      <FairwayMonthGrid
        events={[
          makeEvent({
            id: 'evt-late',
            title: 'Night Practice',
            all_day: false,
            start_date: '2026-09-10T22:00:00-04:00',
            end_date: '2026-09-10T23:30:00-04:00',
            start_time: '2026-09-10T22:00:00-04:00',
            end_time: '2026-09-10T23:30:00-04:00',
          }),
        ]}
        focusDate={new Date(2026, 8, 15)}
        nowRef={new Date(2026, 8, 15)}
        timezone="America/New_York"
      />,
    );
    expect(screen.getAllByTitle(/Night Practice/).length).toBe(1);
  });
});

/**
 * The seeded demo fortnight (Sep 27 – Oct 3 2026, America/New_York), as the
 * production rows store it. September's grid ends on Saturday October 3, so
 * the whole week sits in its last row: the two-day Fall Invitational is one
 * bar over Friday and Saturday, and only the seven September events count
 * toward "events in September".
 */
describe('FairwayMonthGrid — the seeded week in September', () => {
  const TZ = 'America/New_York';
  const seeded: CalendarEvent[] = [
    makeEvent({ id: 's1', title: 'Team practice — short game', event_type: 'practice', start_time: '2026-09-27T18:00:00Z', end_time: '2026-09-27T20:30:00Z' }),
    makeEvent({ id: 's2', title: 'Film & stats review', event_type: 'meeting', start_time: '2026-09-27T22:00:00Z', end_time: '2026-09-27T23:00:00Z' }),
    makeEvent({ id: 's3', title: 'Morning lift', event_type: 'practice', start_time: '2026-09-28T11:00:00Z', end_time: '2026-09-28T12:00:00Z' }),
    makeEvent({ id: 's4', title: 'Team practice — driving', event_type: 'practice', start_time: '2026-09-28T18:00:00Z', end_time: '2026-09-28T21:00:00Z' }),
    makeEvent({ id: 's5', title: 'Qualifier round 1', event_type: 'qualifier', start_time: '2026-09-29T12:00:00Z', end_time: '2026-09-29T17:00:00Z' }),
    makeEvent({ id: 's6', title: 'Qualifier round 2', event_type: 'qualifier', start_time: '2026-09-30T12:00:00Z', end_time: '2026-09-30T17:00:00Z' }),
    makeEvent({ id: 's7', title: '1:1 player check-ins', event_type: 'meeting', start_time: '2026-09-30T19:00:00Z', end_time: '2026-09-30T21:00:00Z' }),
    makeEvent({ id: 's8', title: 'Travel to Fall Invitational', event_type: 'travel', start_time: '2026-10-01T14:00:00Z', end_time: '2026-10-01T19:00:00Z' }),
    makeEvent({ id: 's9', title: 'Fall Invitational — practice round', event_type: 'practice', start_time: '2026-10-01T20:00:00Z', end_time: '2026-10-01T23:00:00Z' }),
    makeEvent({ id: 's10', title: 'Fall Invitational', event_type: 'tournament', all_day: true, start_time: '2026-10-02T04:00:00Z', end_time: '2026-10-04T03:59:00Z' }),
    makeEvent({ id: 's11', title: 'Travel home', event_type: 'travel', start_time: '2026-10-03T21:00:00Z', end_time: '2026-10-04T02:00:00Z' }),
  ].map((e) => ({ ...e, start_date: e.start_time ?? e.start_date, end_date: e.end_time }));

  function renderSeeded(onSelectDate?: (d: Date) => void) {
    return render(
      <FairwayMonthGrid
        events={seeded}
        focusDate={new Date(2026, 8, 27)}
        nowRef={new Date(2026, 8, 27)}
        selectedDate={new Date(2026, 8, 27)}
        timezone={TZ}
        onSelectDate={onSelectDate}
      />,
    );
  }

  it('draws the Fall Invitational as one bar over Friday Oct 2 and Saturday Oct 3', () => {
    renderSeeded();
    const bars = screen.getAllByTitle('Fall Invitational');
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveAttribute('data-days', '2026-10-02 2026-10-03');
    expect(bars[0]!.className).toContain('col-start-6');
    expect(bars[0]!.className).toContain('col-end-8');
  });

  it('puts each timed event on its team-local day, evening travel included', () => {
    renderSeeded();
    expect(screen.getByTitle('Team practice — short game')).toHaveAttribute('data-days', '2026-09-27');
    expect(screen.getByTitle('Qualifier round 1')).toHaveAttribute('data-days', '2026-09-29');
    // 5 – 10 PM ET on Saturday, though it ends on Sunday in UTC.
    const travel = screen.getByTitle('Travel home');
    expect(travel).toHaveAttribute('data-days', '2026-10-03');
    expect(travel).toHaveAccessibleName('Travel home, Travel, 5:00 – 10:00 PM');
  });

  it('counts only September in the header, with a legend by type', () => {
    renderSeeded();
    expect(screen.getByTestId('month-grid-count')).toHaveTextContent('7 events in September');
    const legend = screen.getByRole('list', { name: 'Event types in September' });
    expect(Array.from(legend.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Practice3',
      'Meeting2',
      'Qualifier2',
    ]);
  });

  it('marks today and opens a day from its date strip', () => {
    const onSelectDate = vi.fn();
    renderSeeded(onSelectDate);
    const strips = document.querySelectorAll<HTMLElement>('[data-slot="month-day-strip"][aria-current="date"]');
    expect(strips).toHaveLength(1);
    expect(strips[0]).toHaveAccessibleName('Sunday, September 27, 2 events, today');
    const tuesday = document.querySelector<HTMLElement>('[data-slot="month-day-strip"][aria-label^="Tuesday, September 29"]');
    fireEvent.click(tuesday!);
    expect(onSelectDate).toHaveBeenCalledWith(new Date(2026, 8, 29));
  });
});

describe('FairwayMonthGrid — lanes and overflow', () => {
  it('fits fewer lanes in a shorter row', () => {
    expect(monthLaneCapacity(96)).toBe(2);
    expect(monthLaneCapacity(112)).toBe(3);
    expect(monthLaneCapacity(164)).toBe(5);
  });

  it('keeps a multi-day bar in one lane across its days and stacks the rest under it', () => {
    const weekStart = new Date(2026, 8, 27);
    const at = (d: number) => new Date(2026, 8, d);
    const bar = { kind: 'event' as const, id: 'bar', at: 0, first: at(28), last: at(30), bar: true, event: makeEvent({ id: 'bar' }) };
    const early = { kind: 'event' as const, id: 'early', at: 1, first: at(29), last: at(29), bar: false, event: makeEvent({ id: 'early' }) };
    const late = { kind: 'event' as const, id: 'late', at: 2, first: at(29), last: at(29), bar: false, event: makeEvent({ id: 'late' }) };
    const sunday = { kind: 'event' as const, id: 'sun', at: 3, first: at(27), last: at(27), bar: false, event: makeEvent({ id: 'sun' }) };
    const lanes = Object.fromEntries(layoutMonthWeek([late, sunday, early, bar], weekStart).map((s) => [s.item.id, s.lane]));
    expect(lanes).toEqual({ bar: 0, sun: 0, early: 1, late: 2 });
  });

  it('says "+N more" for what a short row cannot show, and opens that day', () => {
    const original = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
    try {
      const onSelectDate = vi.fn();
      const busy = [9, 10, 11, 12].map((h) =>
        makeEvent({
          id: `busy-${h}`,
          title: `Block ${h}`,
          event_type: 'practice',
          start_date: `2026-09-15T${h + 4}:00:00Z`,
          end_date: `2026-09-15T${h + 5}:00:00Z`,
          start_time: `2026-09-15T${h + 4}:00:00Z`,
          end_time: `2026-09-15T${h + 5}:00:00Z`,
        }),
      );
      render(
        <FairwayMonthGrid
          events={busy}
          focusDate={new Date(2026, 8, 15)}
          nowRef={new Date(2026, 8, 15)}
          timezone="America/New_York"
          onSelectDate={onSelectDate}
        />,
      );
      // A 96px row fits two lanes; with four events one shows, then "+3 more".
      expect(screen.getByTitle('Block 9')).toBeInTheDocument();
      expect(screen.queryByTitle('Block 10')).toBeNull();
      const more = screen.getByRole('button', { name: '3 more on Tuesday, September 15' });
      expect(more).toHaveTextContent('+3 more');
      fireEvent.click(more);
      expect(onSelectDate).toHaveBeenCalledWith(new Date(2026, 8, 15));
    } finally {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: original });
    }
  });
});
