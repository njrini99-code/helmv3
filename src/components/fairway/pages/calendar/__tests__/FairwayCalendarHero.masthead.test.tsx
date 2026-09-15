/**
 * FairwayCalendarHero — the masthead's native details.
 *
 * The month title carries its year quietly (one accessible name, "July 2026",
 * never "July2026"); "Today" carries today's number as a decorative glyph
 * that stays out of the control's name; the masthead publishes its height on
 * the host column so the list's day headings can pin beneath it; and a range
 * fetch in flight is announced from the masthead's own progress line.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import * as React from 'react';
import { FairwayCalendarHero, CALENDAR_HERO_HEIGHT_VAR } from '../FairwayCalendarHero';

const NOW = new Date('2026-07-16T12:00:00');
const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'agenda', label: 'Agenda' },
] as const;

function renderHero(overrides: Partial<React.ComponentProps<typeof FairwayCalendarHero>> = {}) {
  return render(
    <div data-testid="host">
      <FairwayCalendarHero
        focusDate={NOW}
        selectedDate={NOW}
        events={[]}
        nowRef={NOW}
        isCoach
        onNavigate={() => {}}
        onSelectDate={() => {}}
        view="agenda"
        viewOptions={VIEWS}
        onViewChange={() => {}}
        {...overrides}
      />
    </div>,
  );
}

describe('FairwayCalendarHero — masthead details', () => {
  it('names the month title with a space before the quiet year', () => {
    renderHero();
    const title = screen.getByRole('heading', { level: 1 });
    expect(within(title).getByRole('button', { name: 'July 2026, jump to a date' })).toBeInTheDocument();
  });

  it('names the week title with its quiet year in the same run', () => {
    renderHero({ view: 'week' });
    const title = screen.getByRole('heading', { level: 1 });
    expect(within(title).getByRole('button', { name: 'Jul 12 – 18, 2026, jump to a date' })).toBeInTheDocument();
  });

  it('gives "Today" a decorative glyph carrying today\'s number, outside its accessible name', () => {
    renderHero({ focusDate: new Date('2026-08-01T12:00:00') });
    const today = screen.getByRole('button', { name: 'Today' });
    const glyph = today.querySelector('[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    expect(glyph!.textContent).toBe('16');
  });

  it('publishes its height on the host column and removes it on unmount', () => {
    const { unmount } = renderHero();
    const host = screen.getByTestId('host');
    expect(host.style.getPropertyValue(CALENDAR_HERO_HEIGHT_VAR)).toMatch(/^\d+px$/);
    unmount();
    expect(host.style.getPropertyValue(CALENDAR_HERO_HEIGHT_VAR)).toBe('');
  });

  it('announces a range fetch from its own progress line, and nothing when idle', () => {
    const { unmount } = renderHero({ busy: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading events for this date range…');
    unmount();
    renderHero({ busy: false });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('still lets the coach reach the primary action from the masthead', () => {
    const onPrimaryAction = vi.fn();
    renderHero({ onPrimaryAction });
    screen.getByRole('button', { name: 'New event' }).click();
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  it('is a matte bar — no backdrop blur over the scrolling stage, no legacy glass chrome', () => {
    renderHero();
    const root = screen.getByRole('region', { name: 'Calendar controls' });
    expect(root).toHaveClass('bg-surface', 'border-b');
    expect(root.className).not.toMatch(/fw-frost|fw-glass-chrome|backdrop/);
  });
});
