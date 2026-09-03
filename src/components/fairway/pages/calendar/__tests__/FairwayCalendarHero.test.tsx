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

/**
 * GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md #5 — at 810×1080 and 844×390 the
 * "N upcoming · M this <period>" status line wrapped mid-phrase ("1 /
 * upcoming / · 12 in / view") because the flex-shrink-0 nav+CTA cluster left
 * the title column's flex-basis unbounded (no min-width, no wrap fallback).
 * Locks the three cooperating pieces of the fix as a set of class contracts,
 * since jsdom doesn't compute real flex layout: the phrase must carry
 * `whitespace-nowrap`, the title column must carry a floor width at md+ so
 * the row has something to wrap AROUND, and the row itself must be allowed
 * to wrap so the control cluster can drop to its own line instead of
 * squeezing the title arbitrarily thin.
 */
describe('FairwayCalendarHero — tablet header does not wrap the count phrase mid-sentence', () => {
  it('the count phrase never breaks across lines (whitespace-nowrap)', () => {
    const { container } = renderHero({ upcomingCount: 1, windowCount: 12, isMonthView: false, isAgendaView: true });
    const countParagraph = Array.from(container.querySelectorAll('p')).find((p) =>
      (p.textContent ?? '').includes('upcoming'),
    );
    expect(countParagraph).toBeTruthy();
    expect(countParagraph?.className).toContain('whitespace-nowrap');
    expect(countParagraph?.textContent).toContain('1 upcoming · 12 in view');
  });

  it('the title column has a floor width at md+ so the row has something to wrap around', () => {
    const { container } = renderHero();
    const countParagraph = Array.from(container.querySelectorAll('p')).find((p) =>
      (p.textContent ?? '').includes('upcoming'),
    );
    const titleColumn = countParagraph?.parentElement;
    expect(titleColumn?.className).toContain('md:min-w-[260px]');
  });

  it('the header row is allowed to wrap at md+ so the control cluster can drop below the title instead of squeezing it', () => {
    const { container } = renderHero();
    const headerRow = container.querySelector('.md\\:flex-row');
    expect(headerRow).toBeTruthy();
    expect(headerRow?.className).toContain('md:flex-wrap');
  });

  it('the desktop control cluster stays flush right whether it shares the title row or wraps below it', () => {
    const { container } = renderHero();
    const previousButton = container.querySelector('[aria-label="Previous"]');
    const desktopCluster = previousButton?.closest('.md\\:flex');
    expect(desktopCluster?.className).toContain('md:ml-auto');
  });
});
