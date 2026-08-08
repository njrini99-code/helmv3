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
