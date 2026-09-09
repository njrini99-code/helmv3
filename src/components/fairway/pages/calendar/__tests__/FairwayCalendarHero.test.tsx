/**
 * FairwayCalendarHero — the calendar toolbar's contract.
 *
 * The header carries the date context, an explicit view selector, previous /
 * next stepping named for the active view, "Today" only when away from it,
 * and the coach's one primary action. It carries NO event counters: a number
 * whose scope the reader cannot see is not a status line.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import * as React from 'react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayCalendarHero, weekRangeTitle } from '../FairwayCalendarHero';

const NOW = new Date('2026-07-16T12:00:00');
const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'agenda', label: 'Agenda' },
] as const;

function renderHero(overrides: Partial<React.ComponentProps<typeof FairwayCalendarHero>> = {}) {
  const events: CalendarEvent[] = [];
  return render(
    <FairwayCalendarHero
      focusDate={NOW}
      selectedDate={NOW}
      events={events}
      nowRef={NOW}
      isCoach
      onNavigate={() => {}}
      onSelectDate={() => {}}
      view="agenda"
      viewOptions={VIEWS}
      onViewChange={() => {}}
      {...overrides}
    />,
  );
}

describe('FairwayCalendarHero — header contract', () => {
  it('titles the month and offers an explicit view selector', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('July 2026');
    expect(screen.getByRole('radiogroup', { name: 'Calendar view' })).toBeInTheDocument();
  });

  it('titles the selected day in Day view and shows the week strip only there', () => {
    renderHero({ view: 'day', isDayView: true });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Thursday, July 16');
    expect(screen.getByRole('group', { name: 'Week navigator' })).toBeInTheDocument();
  });

  it('shows no week strip for Agenda, Week or Month — the strip would misstate their scope', () => {
    renderHero({ view: 'agenda' });
    expect(screen.queryByRole('group', { name: 'Week navigator' })).not.toBeInTheDocument();
  });

  it('makes the title a date-jump: opening it shows a month grid, picking a day selects it', () => {
    const onSelectDate = vi.fn();
    renderHero({ onSelectDate });
    const title = screen.getByRole('heading', { level: 1 });
    fireEvent.click(within(title).getByRole('button', { name: /July 2026/ }));
    fireEvent.click(screen.getByRole('button', { name: /^(Tuesday, July 21st|July 21)/ }));
    expect(onSelectDate).toHaveBeenCalledTimes(1);
    expect(onSelectDate.mock.calls[0]![0].getDate()).toBe(21);
  });

  it('titles Week view with its exact Sunday-start range', () => {
    renderHero({ view: 'week' });
    // NOW is Thursday, July 16 2026 → the week of Sun Jul 12 – Sat Jul 18.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Jul 12 – 18, 2026');
    expect(weekRangeTitle(new Date(2026, 7, 30))).toBe('Aug 30 – Sep 5, 2026');
    expect(weekRangeTitle(new Date(2026, 11, 29))).toBe('Dec 27, 2026 – Jan 2, 2027');
  });

  it('names previous/next for the active view', () => {
    renderHero({ view: 'month' });
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });

  it('offers "Today" only when the focus date is not today', () => {
    const onNavigate = vi.fn();
    const { unmount } = renderHero({ onNavigate });
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
    unmount();
    renderHero({ focusDate: new Date('2026-08-01T12:00:00'), onNavigate });
    screen.getByRole('button', { name: 'Today' }).click();
    expect(onNavigate).toHaveBeenCalledWith('today');
  });

  it('renders no event counters in the header', () => {
    const { container } = renderHero();
    expect(container.textContent).not.toMatch(/upcoming|in view|this week|this month/);
  });

  it('gives the coach one primary action and never a header CTA to a player', () => {
    const onPrimaryAction = vi.fn();
    const { unmount } = renderHero({ onPrimaryAction });
    expect(screen.getAllByRole('button', { name: 'New event' }).length).toBeGreaterThan(0);
    unmount();
    renderHero({ isCoach: false, onPrimaryAction, primaryActionLabel: 'Respond' });
    expect(screen.queryByRole('button', { name: 'Respond' })).not.toBeInTheDocument();
  });
});
