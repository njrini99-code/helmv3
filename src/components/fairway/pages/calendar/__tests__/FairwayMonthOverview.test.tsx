/**
 * FairwayMonthOverview — the phone month. The green header counts the
 * focused month's events by type, and each day carries one dot per event
 * type on it, in the type's tint, from the same team-clock projection the
 * agenda uses: Travel home (5–10 PM ET Saturday, Sunday in UTC) dots
 * Saturday Oct 3, not Sunday.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayMonthOverview } from '../FairwayMonthOverview';

const TZ = 'America/New_York';

function ev(p: Partial<CalendarEvent> & { id: string; title: string; start_time: string; end_time: string }): CalendarEvent {
  return {
    team_id: 'team-1',
    event_type: 'practice',
    start_date: p.start_time,
    end_date: p.end_time,
    location: null,
    description: null,
    all_day: false,
    ...p,
  } as CalendarEvent;
}

const events: CalendarEvent[] = [
  ev({ id: 's1', title: 'Team practice — short game', start_time: '2026-09-27T18:00:00Z', end_time: '2026-09-27T20:30:00Z' }),
  ev({ id: 's2', title: 'Film & stats review', event_type: 'meeting', start_time: '2026-09-27T22:00:00Z', end_time: '2026-09-27T23:00:00Z' }),
  ev({ id: 's5', title: 'Qualifier round 1', event_type: 'qualifier', start_time: '2026-09-29T12:00:00Z', end_time: '2026-09-29T17:00:00Z' }),
  ev({ id: 's10', title: 'Fall Invitational', event_type: 'tournament', all_day: true, start_time: '2026-10-02T04:00:00Z', end_time: '2026-10-04T03:59:00Z' }),
  ev({ id: 's11', title: 'Travel home', event_type: 'travel', start_time: '2026-10-03T21:00:00Z', end_time: '2026-10-04T02:00:00Z' }),
];

function dayButton(name: RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('FairwayMonthOverview', () => {
  it('counts the month by type in the green header', () => {
    render(
      <FairwayMonthOverview
        events={events}
        selectedDate={new Date(2026, 8, 27)}
        nowRef={new Date(2026, 8, 27)}
        timezone={TZ}
        onSelectDate={() => {}}
      />,
    );
    expect(screen.getByTestId('month-grid-count')).toHaveTextContent('3 events in September');
    const legend = screen.getByRole('list', { name: 'Event types in September' });
    expect(Array.from(legend.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Meeting1',
      'Practice1',
      'Qualifier1',
    ]);
  });

  it('dots each day once per type, on the team-local day', () => {
    render(
      <FairwayMonthOverview
        events={events}
        selectedDate={new Date(2026, 8, 20)}
        nowRef={new Date(2026, 8, 27)}
        timezone={TZ}
        onSelectDate={() => {}}
      />,
    );
    const dots = (name: RegExp) => dayButton(name).querySelectorAll('span[aria-hidden] > span').length;
    expect(dots(/September 27/)).toBe(2); // practice + meeting
    expect(dots(/September 29/)).toBe(1);
    expect(dots(/October 2/)).toBe(1); // tournament
    expect(dots(/October 3/)).toBe(2); // tournament + travel home
    expect(dots(/September 28/)).toBe(0); // nothing in this fixture
  });

  it('selects a day without leaving the month', () => {
    const onSelectDate = vi.fn();
    render(
      <FairwayMonthOverview
        events={events}
        selectedDate={new Date(2026, 8, 27)}
        nowRef={new Date(2026, 8, 27)}
        timezone={TZ}
        onSelectDate={onSelectDate}
      />,
    );
    fireEvent.click(dayButton(/September 29/));
    expect(onSelectDate).toHaveBeenCalledTimes(1);
    expect((onSelectDate.mock.calls[0]![0] as Date).getDate()).toBe(29);
  });
});
