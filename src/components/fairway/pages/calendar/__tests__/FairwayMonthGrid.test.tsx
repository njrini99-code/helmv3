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
});
