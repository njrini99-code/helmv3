/**
 * FairwayAgendaView — the now-line inside today's group.
 *
 * Today's group carries a "now" rule at its sorted position: after every
 * event that has started, before the next one. Other days never carry it.
 * Its first render uses the parent's seeded `nowRef` (so server and client
 * agree); the minute clock only starts after mount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayAgendaView } from '../FairwayAgendaView';

const TZ = 'America/New_York';

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

// Thursday July 16 2026, 3:30 PM in New York (19:30Z).
const NOW = new Date('2026-07-16T19:30:00.000Z');
const NOW_LABEL = '3:30 PM';

describe('FairwayAgendaView — now-line', () => {
  // The minute clock starts after mount from the real `Date`; pin it to the
  // seeded `nowRef` so the line lands where the fixture expects.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sits between what has started and what is next in today\'s group', () => {
    const events = [
      makeEvent('a', '2026-07-16T13:00:00.000Z', 'Morning lift'), // 9:00 AM — started
      makeEvent('b', '2026-07-16T21:00:00.000Z', 'Short game'), // 5:00 PM — next
    ];
    render(
      <FairwayAgendaView events={events} mode="day" focusDate={NOW} isCoach timezone={TZ} nowRef={NOW} />,
    );
    const today = screen.getByRole('region', { name: 'Today' });
    const line = within(today).getByTestId('agenda-now-line');
    expect(line).toHaveAccessibleName(`Now, ${NOW_LABEL}`);
    const rows = within(today).getAllByRole('button');
    const group = line.parentElement!;
    const order = Array.from(group.children);
    expect(order.indexOf(rows[0]!)).toBeLessThan(order.indexOf(line));
    expect(order.indexOf(line)).toBeLessThan(order.indexOf(rows[1]!));
  });

  it('closes the group when everything today has already started', () => {
    const events = [makeEvent('a', '2026-07-16T13:00:00.000Z', 'Morning lift')];
    render(
      <FairwayAgendaView events={events} mode="day" focusDate={NOW} isCoach timezone={TZ} nowRef={NOW} />,
    );
    const line = screen.getByTestId('agenda-now-line');
    const group = line.parentElement!;
    expect(group.lastElementChild).toBe(line);
  });

  it('never appears in another day\'s group', () => {
    const tomorrow = new Date('2026-07-17T19:30:00.000Z');
    const events = [makeEvent('a', '2026-07-17T21:00:00.000Z', 'Qualifier')];
    render(
      <FairwayAgendaView events={events} mode="day" focusDate={tomorrow} isCoach timezone={TZ} nowRef={NOW} />,
    );
    expect(screen.queryByTestId('agenda-now-line')).not.toBeInTheDocument();
  });

  it('labels Today with its calendar date beside the heading', () => {
    const events = [makeEvent('a', '2026-07-16T21:00:00.000Z', 'Short game')];
    render(
      <FairwayAgendaView events={events} mode="day" focusDate={NOW} isCoach timezone={TZ} nowRef={NOW} />,
    );
    const today = screen.getByRole('region', { name: 'Today' });
    expect(within(today).getByRole('heading', { level: 2 })).toHaveTextContent('Today');
    expect(today).toHaveTextContent('Thursday, July 16');
  });
});
