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
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayMonthGrid } from '../FairwayMonthGrid';

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
    expect(chip.getAttribute('style')).toMatch(/background-color/);
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
  /** The day cell containing a given date's number button. */
  function cellFor(label: string): HTMLElement {
    const dayButton = screen.getByLabelText(label);
    const cell = dayButton.closest('div.flex.h-full');
    if (!cell) throw new Error(`no day cell for ${label}`);
    return cell as HTMLElement;
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
    for (const label of [
      'Thursday, September 3',
      'Friday, September 4',
      'Saturday, September 5',
      'Sunday, September 6',
    ]) {
      const chips = cellFor(label).querySelectorAll('[title*="Transylvania Invite"]');
      expect(chips.length, label).toBe(1);
    }
  });

  it('does not bleed onto the day before or the day after', () => {
    renderSeptember();
    for (const label of ['Wednesday, September 2', 'Monday, September 7']) {
      const chips = cellFor(label).querySelectorAll('[title*="Transylvania Invite"]');
      expect(chips.length, label).toBe(0);
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
