/**
 * ============================================================================
 * CalendarView.tsx — the month grid's interactive structure
 * ----------------------------------------------------------------------------
 * This component shipped unrendered — the CRM had no calendar at all until it was
 * wired to a Calendar destination on 2026-07-29. Events were creatable
 * (QuickActionsPanel) and readable one coach at a time (getCoachTimeline); what did
 * not exist was the schedule view, or any way to open an event once created.
 *
 * Never having rendered, it had never had its DOM checked, and the month cell was
 * a `<Button>` containing the event pills, which are also `<Button>` — a <button>
 * inside a <button>. That is invalid HTML: the parser hoists the inner button out,
 * so the server markup and the client tree disagree and hydration throws (#418 /
 * #423). CLAUDE.md calls this out as a known crash class for exactly this shape.
 *
 * The first test is deliberately structural rather than about the calendar: ANY
 * nested interactive element is the bug. Written that way it also catches the next
 * person who wraps a cell in a button.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test/utils';
import { fireEvent } from '@testing-library/react';
import { format, setHours, setMinutes } from 'date-fns';
import { CalendarView } from './CalendarView';

// An event on today's date, so it lands inside the month view's visible weeks
// and the grid renders pills (an empty result set renders EmptyState instead,
// which would make the nesting assertion below vacuous).
const TODAY = setMinutes(setHours(new Date(), 14), 0);
const EVENT = {
  id: 'event-1',
  title: 'Demo — Stanford',
  description: null,
  event_type: 'demo',
  start_time: TODAY.toISOString(),
  end_time: setMinutes(setHours(new Date(), 14), 30).toISOString(),
  all_day: false,
  location: null,
  meeting_url: null,
  coach_id: 'coach-1',
  coach_name: 'Coach Davis',
  coach_school: 'Stanford',
  status: 'scheduled',
  google_event_id: null,
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    // The component's primary read path. Returning data here avoids the
    // console.error fallback branch.
    rpc: vi.fn(async () => ({ data: [EVENT], error: null })),
  }),
}));

describe('CalendarView — month grid structure', () => {
  it('nests no interactive element inside another', async () => {
    const { container, findByText } = render(<CalendarView />);
    // Wait for the fetch to resolve so pills exist — otherwise this passes
    // against a skeleton and proves nothing.
    await findByText(EVENT.title);

    const interactive = Array.from(
      container.querySelectorAll('button, a[href], input, select, textarea'),
    );
    expect(interactive.length).toBeGreaterThan(0);

    const nested = interactive
      .filter((el) => el.querySelector('button, a[href], input, select, textarea') !== null)
      .map((el) => `<${el.tagName.toLowerCase()}> contains an interactive child: ${el.textContent?.slice(0, 60)}`);

    expect(nested).toEqual([]);
  });

  it('opens the event, not the schedule slot, when a pill is clicked', async () => {
    const onEventClick = vi.fn();
    const onSlotClick = vi.fn();
    const { findByText } = render(
      <CalendarView onEventClick={onEventClick} onSlotClick={onSlotClick} />,
    );

    fireEvent.click(await findByText(EVENT.title));

    expect(onEventClick).toHaveBeenCalledWith(expect.objectContaining({ id: EVENT.id }));
    // The pill used to sit inside the cell button, so a pill click could reach
    // both handlers. They are siblings now — the slot must stay untouched.
    expect(onSlotClick).not.toHaveBeenCalled();
  });

  it('opens the schedule slot when the empty area of a day is clicked', async () => {
    const onEventClick = vi.fn();
    const onSlotClick = vi.fn();
    const { findByText, getByRole } = render(
      <CalendarView onEventClick={onEventClick} onSlotClick={onSlotClick} />,
    );
    await findByText(EVENT.title);

    // The full-bleed overlay carries the cell's accessible name.
    fireEvent.click(getByRole('button', { name: `Schedule on ${format(TODAY, 'EEEE, MMMM d')}` }));

    expect(onSlotClick).toHaveBeenCalledTimes(1);
    expect(onEventClick).not.toHaveBeenCalled();
  });

  /**
   * Every day cell needs a reachable name of its own. Before the fix the cell
   * button's name was the concatenation of the day number and every pill inside
   * it ("15 Demo — Stanford Follow-up…"), which is both unreadable and unstable.
   */
  it('gives each day cell its own accessible name', async () => {
    const { findByText, getAllByRole } = render(<CalendarView />);
    await findByText(EVENT.title);

    const slots = getAllByRole('button', { name: /^Schedule on / });
    // A month view spans 5 or 6 weeks of 7 days.
    expect(slots.length).toBeGreaterThanOrEqual(35);
    expect(slots.length).toBeLessThanOrEqual(42);
  });
});

/**
 * The week view was `overflow-hidden` around a ~700px-wide grid (a 64px time
 * gutter plus seven columns). Below that width the last weekdays were CLIPPED —
 * not shrunk, unreachable, with no scrollbar to reveal them. Asserting the
 * scroll container is a class-level check, but the alternative is a layout
 * measurement jsdom cannot do (it reports every width as 0).
 */
describe('CalendarView — narrow viewports', () => {
  it('lets the week grid scroll instead of clipping the last days', async () => {
    const { container, findByText, getByRole, findAllByText } = render(<CalendarView />);
    await findByText(EVENT.title);

    fireEvent.click(getByRole('button', { name: 'week' }));

    // Switching view changes dateRange, which re-runs the fetch and swaps the
    // grid for the loading skeleton — so this has to await the second render,
    // not read the DOM synchronously.
    const [saturday] = await findAllByText('Sat');
    expect(saturday).toBeDefined();

    // Walk from a weekday header up to the component root, collecting only the
    // ancestors that actually contain the grid. Checking the whole container
    // instead would match the shared IconButton base class, which carries
    // `overflow-hidden` for its own ripple and is not on this path at all —
    // that false positive is what the first version of this test tripped on.
    const path: string[] = [];
    for (let el = saturday!.parentElement; el && el !== container; el = el.parentElement) {
      path.push(el.className);
    }

    expect(
      path.some((c) => c.includes('overflow-x-auto')),
      'the week grid needs a horizontal scroll container',
    ).toBe(true);
    expect(
      path.filter((c) => /\boverflow-hidden\b/.test(c)),
      'an overflow-hidden ancestor clips the weekdays that do not fit, with no way to scroll to them',
    ).toEqual([]);
  });
});
