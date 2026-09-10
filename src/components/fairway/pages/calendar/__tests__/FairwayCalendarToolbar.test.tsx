/**
 * FairwayCalendarToolbar — the desktop (>=768px) masthead, built on the
 * shared `Toolbar` primitive (material="frost", sticky) per
 * docs/design/fairway-facelift/screens/calendar.desktop.md. ONE row: period
 * title + prev/next + Today (leading), the explicit view selector
 * (viewToggle), the secondary actions (filters), and the coach's ONE
 * primary action.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import * as React from 'react';
import { FairwayCalendarToolbar } from '../FairwayCalendarHero';

const NOW = new Date('2026-07-16T12:00:00');
const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'agenda', label: 'Agenda' },
] as const;

function renderToolbar(overrides: Partial<React.ComponentProps<typeof FairwayCalendarToolbar>> = {}) {
  return render(
    <FairwayCalendarToolbar
      focusDate={NOW}
      selectedDate={NOW}
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

describe('FairwayCalendarToolbar — desktop masthead contract', () => {
  it('is ONE row built on the shared Toolbar: sticky, frost at rest', () => {
    renderToolbar();
    const row = screen.getByRole('toolbar', { name: 'Calendar controls' });
    expect(row.getAttribute('data-material')).toBe('frost');
    expect(row.className).toContain('sticky');
  });

  it('titles the month and offers an explicit view selector, same as the phone bar', () => {
    renderToolbar();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('July 2026');
    expect(screen.getByRole('radiogroup', { name: 'Calendar view' })).toBeInTheDocument();
  });

  it('names previous/next for the active view', () => {
    renderToolbar({ view: 'month' });
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });

  it('offers "Today" only when the focus date is not today', () => {
    const onNavigate = vi.fn();
    const { unmount } = renderToolbar({ onNavigate });
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
    unmount();
    renderToolbar({ focusDate: new Date('2026-08-01T12:00:00'), onNavigate });
    screen.getByRole('button', { name: 'Today' }).click();
    expect(onNavigate).toHaveBeenCalledWith('today');
  });

  it('makes the title a date-jump: opening it shows a month grid, picking a day selects it', () => {
    const onSelectDate = vi.fn();
    renderToolbar({ onSelectDate });
    const title = screen.getByRole('heading', { level: 1 });
    fireEvent.click(within(title).getByRole('button', { name: /July 2026/ }));
    fireEvent.click(screen.getByRole('button', { name: /^(Tuesday, July 21st|July 21)/ }));
    expect(onSelectDate).toHaveBeenCalledTimes(1);
    expect(onSelectDate.mock.calls[0]![0].getDate()).toBe(21);
  });

  it('gives the coach one primary action and never a header CTA to a player', () => {
    const onPrimaryAction = vi.fn();
    const { unmount } = renderToolbar({ onPrimaryAction });
    screen.getByRole('button', { name: 'New event' }).click();
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
    unmount();
    renderToolbar({ isCoach: false, onPrimaryAction, primaryActionLabel: 'Respond' });
    expect(screen.queryByRole('button', { name: 'Respond' })).not.toBeInTheDocument();
  });

  it('surfaces the secondary actions inline (desktop has room; no overflow menu)', () => {
    renderToolbar({
      onFindTime: vi.fn(),
      onConflicts: vi.fn(),
      onAvailability: vi.fn(),
      onSubscribe: vi.fn(),
      conflictCount: 3,
    });
    expect(screen.getByRole('button', { name: 'Find a time' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conflicts (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My availability' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument();
  });

  it('announces a range fetch from its own progress line, and nothing when idle', () => {
    const { unmount } = renderToolbar({ busy: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading events for this date range…');
    unmount();
    renderToolbar({ busy: false });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
