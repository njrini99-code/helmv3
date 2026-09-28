/**
 * FairwayDayTimeGrid — the Day view's time grid.
 *
 * Blocks sit at their TEAM-clock start and are as tall as they last, 2px apart
 * where they meet; overlaps share the column; an all-day tournament shows on
 * each of its days in the band above the hours (and nowhere else); the
 * now-line only appears on the team's today, once mounted; the grid opens an
 * hour ahead of what matters.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import {
  BLOCK_GAP_PX,
  DAY_GRID_HOUR_PX,
  FairwayDayTimeGrid,
  MIN_BLOCK_PX,
  dayGridRangeLabel,
  layoutDayBlocks,
  scrollAnchorMinute,
} from '../FairwayDayTimeGrid';

const TZ = 'America/New_York';

function ev(partial: Partial<CalendarEvent> & { id: string; title: string; start_time: string }): CalendarEvent {
  return {
    team_id: 'team-1',
    event_type: 'practice',
    start_date: partial.start_time,
    end_date: partial.end_time ?? partial.start_time,
    end_time: partial.end_time ?? partial.start_time,
    location: null,
    description: null,
    all_day: false,
    ...partial,
  } as CalendarEvent;
}

// The seeded demo week (production rows, Sep 27 – Oct 3 2026, ET).
const practice = ev({ id: 'p', title: 'Team practice — short game', start_time: '2026-09-27T18:00:00Z', end_time: '2026-09-27T20:30:00Z', location: 'Home course range' });
const film = ev({ id: 'f', title: 'Film & stats review', event_type: 'meeting', start_time: '2026-09-27T22:00:00Z', end_time: '2026-09-27T23:00:00Z' });
const invitational = ev({
  id: 'inv',
  title: 'Fall Invitational',
  event_type: 'tournament',
  all_day: true,
  start_time: '2026-10-02T04:00:00Z',
  end_time: '2026-10-04T03:59:00Z',
});
const travelHome = ev({ id: 'home', title: 'Travel home', event_type: 'travel', start_time: '2026-10-03T21:00:00Z', end_time: '2026-10-04T02:00:00Z' });

afterEach(() => {
  vi.useRealTimers();
});

describe('FairwayDayTimeGrid', () => {
  it('places each block at its team-clock start, as tall as it lasts', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T15:00:00Z'));
    render(
      <FairwayDayTimeGrid events={[practice, film]} focusDate={new Date(2026, 8, 27)} nowRef={new Date(2026, 8, 27)} isCoach timezone={TZ} />,
    );
    const blocks = screen.getAllByTestId('day-grid-block');
    expect(blocks).toHaveLength(2);
    const [first, second] = blocks as [HTMLElement, HTMLElement];
    // 2:00 PM ET → 14h; 2.5h tall, less the 2px gap it shares with a neighbour.
    expect(parseFloat(first.style.top)).toBeCloseTo(14 * DAY_GRID_HOUR_PX + BLOCK_GAP_PX / 2);
    expect(parseFloat(first.style.height)).toBeCloseTo(2.5 * DAY_GRID_HOUR_PX - BLOCK_GAP_PX);
    expect(first).toHaveAccessibleName(/^Team practice — short game, Practice, 2:00 – 4:30\sPM, Home course range$/);
    expect(parseFloat(second.style.top)).toBeCloseTo(18 * DAY_GRID_HOUR_PX + BLOCK_GAP_PX / 2);
    expect(screen.getByTestId('day-grid-count')).toHaveTextContent(/^2 events$/);
    expect(screen.getByTestId('day-grid-booked')).toHaveTextContent(/^3h 30m scheduled$/);
  });

  it('paints each block in its type colour with a sticky label, never a receded placeholder', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 10:58 PM ET: both of Sunday's events are over, and still keep their colour.
    vi.setSystemTime(new Date('2026-09-28T02:58:00Z'));
    render(
      <FairwayDayTimeGrid events={[practice, film]} focusDate={new Date(2026, 8, 27)} nowRef={new Date(2026, 8, 27)} isCoach timezone={TZ} />,
    );
    const [block, meeting] = screen.getAllByTestId('day-grid-block') as [HTMLElement, HTMLElement];
    expect(block.style.getPropertyValue('--ev-fill')).toContain('var(--fw-tint-1-bg)');
    expect(block.style.getPropertyValue('--ev-ink')).toBe('var(--fw-tint-1-ink)');
    expect(meeting.style.getPropertyValue('--ev-ink')).toBe('var(--fw-tint-6-ink)');
    // Clip, not hidden: `overflow: hidden` would make the block its own scroll
    // container and the label could never stick.
    expect(block.className).toContain('overflow-clip');
    expect(block.className).not.toContain('overflow-hidden');
    const label = block.querySelector('[data-slot="block-label"]');
    expect(label?.className).toContain('sticky');
    expect(label?.className).toContain('top-0');
    expect(label).toHaveTextContent('Team practice — short game');
    expect(label).toHaveTextContent(/2:00 – 4:30\sPM · Home course range/);
    // The title is text-primary, semibold, 14px: not the receded secondary.
    const title = label?.querySelector('.font-semibold');
    expect(title?.className).toContain('text-text-primary');
    expect(title?.className).toContain('text-sm');
  });

  it('keeps a short event a full tap target, on one line', () => {
    const lift = ev({ id: 'l', title: 'Morning lift', start_time: '2026-09-28T11:00:00Z', end_time: '2026-09-28T11:30:00Z' });
    render(<FairwayDayTimeGrid events={[lift]} focusDate={new Date(2026, 8, 28)} isCoach timezone={TZ} />);
    const block = screen.getByTestId('day-grid-block');
    expect(parseFloat(block.style.height)).toBe(MIN_BLOCK_PX);
    expect(block.querySelector('[data-slot="block-label"]')).toBeNull();
    expect(block).toHaveTextContent(/Morning lift7:00 – 7:30\sAM/);
  });

  it('shows the two-day tournament in the all-day band on Oct 2 and Oct 3 only', () => {
    const renderDay = (d: number) =>
      render(<FairwayDayTimeGrid events={[invitational, travelHome]} focusDate={new Date(2026, 9, d)} isCoach timezone={TZ} />);

    const oct2 = renderDay(2);
    expect(within(oct2.container).getByRole('button', { name: /Fall Invitational, all day, day 1 of 2/ })).toBeInTheDocument();
    oct2.unmount();

    const oct3 = renderDay(3);
    expect(within(oct3.container).getByRole('button', { name: /Fall Invitational, all day, day 2 of 2/ })).toBeInTheDocument();
    // Travel home is 5 – 10 PM ET on Oct 3, not the UTC date it ends on.
    expect(within(oct3.container).getByRole('button', { name: /Travel home, Travel, 5:00 – 10:00\sPM/ })).toBeInTheDocument();
    oct3.unmount();

    const oct4 = renderDay(4);
    expect(within(oct4.container).queryByText('Fall Invitational')).not.toBeInTheDocument();
    expect(within(oct4.container).queryByText('Travel home')).not.toBeInTheDocument();
    expect(within(oct4.container).getByText('Nothing on the books')).toBeInTheDocument();
    // The grid still renders on an empty day: the hours stay, empty.
    expect(within(oct4.container).getByTestId('day-grid-scroller')).toBeInTheDocument();
    expect(within(oct4.container).queryAllByTestId('day-grid-block')).toHaveLength(0);
  });

  it('draws the now-line on the team’s today only', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 10:58 PM ET on Sep 27 is already Sep 28 in UTC.
    vi.setSystemTime(new Date('2026-09-28T02:58:00Z'));
    const today = render(
      <FairwayDayTimeGrid events={[practice, film]} focusDate={new Date(2026, 8, 27)} nowRef={new Date(2026, 8, 27)} isCoach timezone={TZ} />,
    );
    const line = within(today.container).getByTestId('day-grid-now-line');
    expect(line).toHaveAccessibleName(/Now, 10:58\sPM/);
    expect(parseFloat(line.style.top)).toBeCloseTo((22 * 60 + 58) * (DAY_GRID_HOUR_PX / 60));
    expect(within(today.container).getByTestId('day-grid-status')).toHaveTextContent('All done for today');
    today.unmount();

    const tomorrow = render(
      <FairwayDayTimeGrid events={[practice]} focusDate={new Date(2026, 8, 28)} nowRef={new Date(2026, 8, 27)} isCoach timezone={TZ} />,
    );
    expect(within(tomorrow.container).queryByTestId('day-grid-now-line')).not.toBeInTheDocument();
  });

  it('splits overlapping events into side-by-side lanes and keeps short ones tappable', () => {
    const a = { event: ev({ id: 'a', title: 'A', start_time: 'x' }), startMin: 600, endMin: 660, continuesBefore: false, continuesAfter: false };
    const b = { event: ev({ id: 'b', title: 'B', start_time: 'x' }), startMin: 630, endMin: 700, continuesBefore: false, continuesAfter: false };
    const c = { event: ev({ id: 'c', title: 'C', start_time: 'x' }), startMin: 720, endMin: 725, continuesBefore: false, continuesAfter: false };
    const d = { event: ev({ id: 'd', title: 'D', start_time: 'x' }), startMin: 730, endMin: 740, continuesBefore: false, continuesAfter: false };
    const placed = layoutDayBlocks([a, b, c, d]);
    const byId = Object.fromEntries(placed.map((p) => [p.event.id, p]));
    expect([byId.a!.lane, byId.a!.lanes]).toEqual([0, 2]);
    expect([byId.b!.lane, byId.b!.lanes]).toEqual([1, 2]);
    // C reserves a 44px tap target, so D (starting 10 min later) sits beside it.
    expect([byId.c!.lane, byId.c!.lanes]).toEqual([0, 2]);
    expect([byId.d!.lane, byId.d!.lanes]).toEqual([1, 2]);
  });

  it('opens an hour ahead of what matters', () => {
    const day = [
      { startMin: 14 * 60, endMin: 16 * 60 + 30 },
      { startMin: 18 * 60, endMin: 19 * 60 },
    ];
    // Any other day: the first event.
    expect(scrollAnchorMinute(day, null)).toBe(13 * 60);
    // Today, before anything starts: now.
    expect(scrollAnchorMinute(day, 9 * 60)).toBe(8 * 60);
    // Today, during practice: the start of practice, not the middle of it.
    expect(scrollAnchorMinute(day, 15 * 60 + 20)).toBe(13 * 60);
    // Today, all done (10:58 PM): the day that happened, not an empty evening.
    expect(scrollAnchorMinute(day, 22 * 60 + 58)).toBe(13 * 60);
    // Today with nothing on: now. Any other empty day: 7 AM.
    expect(scrollAnchorMinute([], 10 * 60)).toBe(9 * 60);
    expect(scrollAnchorMinute([], null)).toBe(7 * 60);
    // Never above midnight.
    expect(scrollAnchorMinute([{ startMin: 20, endMin: 80 }], null)).toBe(0);
  });

  it('labels a range with one meridiem when both ends share it', () => {
    expect(dayGridRangeLabel(practice, TZ)).toMatch(/^2:00 – 4:30\sPM$/);
    const crossing = ev({ id: 'x', title: 'X', start_time: '2026-09-29T15:00:00Z', end_time: '2026-09-29T17:00:00Z' });
    expect(dayGridRangeLabel(crossing, TZ)).toMatch(/^11:00\sAM – 1:00\sPM$/);
  });
});
