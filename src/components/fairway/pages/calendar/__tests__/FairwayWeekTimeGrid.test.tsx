/**
 * FairwayWeekTimeGrid — the seeded demo week (Sep 27 – Oct 3 2026, ET).
 *
 * The two-day Fall Invitational is ONE all-day bar over Friday and Saturday;
 * timed events land in the column of their team-local day; a day header
 * opens that day; today's header is marked current.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayWeekTimeGrid, layoutAllDaySegments } from '../FairwayWeekTimeGrid';

const TZ = 'America/New_York';

function ev(partial: Partial<CalendarEvent> & { id: string; title: string; start_time: string; end_time: string }): CalendarEvent {
  return {
    team_id: 'team-1',
    event_type: 'practice',
    start_date: partial.start_time,
    end_date: partial.end_time,
    location: null,
    description: null,
    all_day: false,
    ...partial,
  } as CalendarEvent;
}

const week: CalendarEvent[] = [
  ev({ id: 'b7361f17', title: 'Team practice — short game', start_time: '2026-09-27T18:00:00Z', end_time: '2026-09-27T20:30:00Z' }),
  ev({ id: '743e6059', title: 'Film & stats review', event_type: 'meeting', start_time: '2026-09-27T22:00:00Z', end_time: '2026-09-27T23:00:00Z' }),
  ev({ id: '97a806d0', title: 'Qualifier round 1', event_type: 'qualifier', start_time: '2026-09-29T12:00:00Z', end_time: '2026-09-29T17:00:00Z' }),
  ev({ id: '85c95bd3', title: 'Fall Invitational', event_type: 'tournament', all_day: true, start_time: '2026-10-02T04:00:00Z', end_time: '2026-10-04T03:59:00Z' }),
  ev({ id: 'e1645f42', title: 'Travel home', event_type: 'travel', start_time: '2026-10-03T21:00:00Z', end_time: '2026-10-04T02:00:00Z' }),
];

afterEach(() => {
  vi.useRealTimers();
});

describe('FairwayWeekTimeGrid', () => {
  it('draws the Fall Invitational as one bar over Friday and Saturday', () => {
    render(<FairwayWeekTimeGrid events={week} focusDate={new Date(2026, 8, 30)} isCoach timezone={TZ} />);
    const bar = screen.getByRole('button', { name: /Fall Invitational, all day, 2 days/ });
    // Columns are 1-based: Sunday = 1, so Friday–Saturday is 6 / 8.
    expect(bar.style.gridColumn).toBe('6 / 8');
  });

  it('puts each timed event in its team-local day column', () => {
    const { container } = render(<FairwayWeekTimeGrid events={week} focusDate={new Date(2026, 8, 30)} isCoach timezone={TZ} />);
    const scroller = within(container).getByTestId('week-grid-scroller');
    const columns = scroller.querySelectorAll(':scope > div > div.grid > div');
    expect(columns).toHaveLength(7);
    expect(within(columns[0] as HTMLElement).getByRole('button', { name: /Team practice — short game/ })).toBeInTheDocument();
    expect(within(columns[2] as HTMLElement).getByRole('button', { name: /Qualifier round 1/ })).toBeInTheDocument();
    // 5 – 10 PM ET on Saturday, though it ends on Sunday in UTC.
    expect(within(columns[6] as HTMLElement).getByRole('button', { name: /Travel home, Travel, 5:00 – 10:00\sPM/ })).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // events this week
  });

  it('opens a day from its header and marks today', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T16:00:00Z'));
    const onSelectDay = vi.fn();
    render(
      <FairwayWeekTimeGrid
        events={week}
        focusDate={new Date(2026, 8, 27)}
        nowRef={new Date(2026, 8, 27)}
        isCoach
        timezone={TZ}
        onSelectDay={onSelectDay}
      />,
    );
    const sunday = screen.getByRole('button', { name: /Sunday, September 27, 2 events, today/ });
    expect(sunday).toHaveAttribute('aria-current', 'date');
    fireEvent.click(screen.getByRole('button', { name: /Tuesday, September 29/ }));
    expect(onSelectDay).toHaveBeenCalledWith(new Date(2026, 8, 29));
    expect(screen.getByTestId('day-grid-now-line')).toBeInTheDocument();
  });

  it('stacks overlapping all-day bars into separate rows', () => {
    const a = { event: week[3]!, startCol: 5, endCol: 6, continuesBefore: false, continuesAfter: false };
    const b = { event: { ...week[3]!, id: 'zz' }, startCol: 6, endCol: 6, continuesBefore: false, continuesAfter: false };
    const c = { event: { ...week[3]!, id: 'yy' }, startCol: 0, endCol: 1, continuesBefore: false, continuesAfter: false };
    const lanes = Object.fromEntries(layoutAllDaySegments([a, b, c]).map((s) => [s.event.id, s.lane]));
    expect(lanes).toEqual({ yy: 0, '85c95bd3': 0, zz: 1 });
  });
});
