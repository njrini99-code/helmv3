/**
 * FairwayCalendarHero — honest status line grammar (findings
 * #84/#106/#155/#165/#12/#80: "X upcoming · Y this this <period>", a broken
 * sentence reported on every view — Day/Week/Month/Agenda all route through
 * this one hero).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as React from 'react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayCalendarHero } from '../FairwayCalendarHero';

const NOW = new Date('2026-07-16T12:00:00');

function renderHero(overrides: Partial<React.ComponentProps<typeof FairwayCalendarHero>> = {}) {
  const events: CalendarEvent[] = [];
  return render(
    <FairwayCalendarHero
      focusDate={NOW}
      selectedDate={NOW}
      events={events}
      nowRef={NOW}
      upcomingCount={3}
      windowCount={2}
      isMonthView={false}
      isAgendaView={false}
      isCoach
      onNavigate={() => {}}
      onSelectDate={() => {}}
      {...overrides}
    />,
  );
}

describe('FairwayCalendarHero — status line grammar', () => {
  it('never renders a duplicated "this this" for the week lens', () => {
    const { container } = renderHero({ isMonthView: false, isAgendaView: false });
    const line = container.textContent ?? '';
    expect(line).toContain('this week');
    expect(line).not.toContain('this this');
  });

  it('never renders a duplicated "this this" for the month lens', () => {
    const { container } = renderHero({ isMonthView: true, isAgendaView: false });
    const line = container.textContent ?? '';
    expect(line).toContain('this month');
    expect(line).not.toContain('this this');
  });

  it('reads as a grammatical sentence for the wide agenda lens ("in view", not "this in view")', () => {
    const { container } = renderHero({ isMonthView: false, isAgendaView: true });
    const line = container.textContent ?? '';
    expect(line).toContain('2 in view');
    expect(line).not.toContain('this in view');
    expect(line).not.toContain('this this');
  });

  // mustFix #4: Day view had no branch of its own and fell through to the
  // "week" label (the Day lens' internal fetch buffer reuses the week
  // range), so a single-day window was mislabeled "this week".
  it('labels the single-day lens "today", never falling through to "this week"', () => {
    const { container } = renderHero({ isMonthView: false, isAgendaView: false, isDayView: true });
    const line = container.textContent ?? '';
    expect(line).toContain('2 today');
    expect(line).not.toContain('this week');
    expect(line).not.toContain('this this');
  });

  it('still labels the week lens "this week" when isDayView is explicitly false', () => {
    const { container } = renderHero({ isMonthView: false, isAgendaView: false, isDayView: false });
    const line = container.textContent ?? '';
    expect(line).toContain('2 this week');
  });
});
