/**
 * ============================================================================
 * DayScheduleSwipe — the player dashboard's top-slot swipeable day calendar.
 * ----------------------------------------------------------------------------
 * Locks the founder-requested replacement of the "You're gaining most …"
 * hero (2026-07-24): one day at a time, chevron/swipe navigation bounded to
 * [today … last day in the feed], honest empty-day copy, and DaySchedule's
 * exact row idiom (time / title / type pill / location).
 * ========================================================================== */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DayScheduleSwipe } from './DayScheduleSwipe';
import type { DayScheduleEvent } from './DaySchedule';

/** ISO timestamp on today+`dayOffset` at the given local hour. */
function iso(dayOffset: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function events(): DayScheduleEvent[] {
  return [
    { id: 'e-today', title: 'Team Practice', event_type: 'practice', start_time: iso(0, 15), location: 'Range' },
    // Nothing on day +1 — the honest empty-day copy must show there.
    { id: 'e-plus2', title: 'Qualifier R2', event_type: 'qualifier', start_time: iso(2, 8), location: 'Home Course' },
  ];
}

describe('DayScheduleSwipe', () => {
  it("renders today's events after the client tz resolves", async () => {
    render(<DayScheduleSwipe events={events()} />);
    await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());
    expect(screen.getByText('Team Practice')).toBeInTheDocument();
    expect(screen.getByText('Practice')).toBeInTheDocument();
    expect(screen.getByText('Range')).toBeInTheDocument();
    // At today, backwards navigation is off the table (feed has no past days).
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled();
  });

  it('chevrons walk day by day, bounded to the last day in the feed', async () => {
    const user = userEvent.setup();
    render(<DayScheduleSwipe events={events()} />);
    await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());

    const next = screen.getByRole('button', { name: 'Next day' });
    await user.click(next);
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    // Day +1 has nothing — honest empty copy, not a blank card.
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();

    await user.click(next);
    expect(screen.getByText('Qualifier R2')).toBeInTheDocument();
    // Feed knows nothing past day +2 — a further "next" would fabricate an
    // empty day, so the bound disables it.
    expect(next).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Back to today' }));
    expect(screen.getByText('Team Practice')).toBeInTheDocument();
  });

  it('renders the honest clear-day copy when the feed is empty', async () => {
    render(<DayScheduleSwipe events={[]} />);
    await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  });
});
