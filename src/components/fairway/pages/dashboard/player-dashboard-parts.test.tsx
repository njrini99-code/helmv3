/** player-dashboard-parts — TodayCard. (The SG radar teaser was removed, OD-08.) */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TodayCard } from './player-dashboard-parts';
import type {
  TodayEvent,
  ActionItem,
} from '@/app/golf/actions/dashboard-data';

/* ─────────────────────────────────────────────────────────────────────────
 * TodayCard — Wave 3 player-home premium pass (Nick's flagged element) +
 * the DaySchedule wave (Action center removal)
 * ----------------------------------------------------------------------------
 * The old "What needs you" subtitle + populated "N thing(s) need(s) you"
 * preview row (a hero-style restatement of the SAME count the Action center
 * section used to show in full below it) is gone. The card's body always
 * shows the player's real today content — next event + lead task.
 *
 * The Action center section itself is also gone (replaced by the DaySchedule
 * card further down the page) — TodayCard no longer accepts a `hubSummary`
 * prop or gates a "See details" jump-link on it. The footer is now a single,
 * always-honest link straight to the full calendar.
 * ──────────────────────────────────────────────────────────────────────── */

const EVENT: TodayEvent = {
  id: 'e1',
  title: 'Team practice',
  event_type: 'practice',
  start_time: '2026-07-22T14:00:00.000Z',
  end_time: null,
  location: 'Range',
};

const TASK: ActionItem = {
  id: 't1',
  type: 'task',
  title: 'Submit round',
  date: '2026-07-22',
  overdue: false,
};

describe('TodayCard — no restated "N thing(s) need(s) you" preview row', () => {
  it('renders the real next event + lead task', () => {
    render(<TodayCard events={[EVENT]} actionItems={[TASK]} />);

    expect(screen.getByText('Team practice')).toBeInTheDocument();
    expect(screen.getByText('Submit round')).toBeInTheDocument();
    // The old preview copy must never render again, in any form.
    expect(screen.queryByText(/things? needs? you/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/what needs you/i)).not.toBeInTheDocument();
  });

  it('shows the honest "Nothing scheduled" empty state when there is no local today content', () => {
    render(<TodayCard events={[]} actionItems={[]} />);

    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();
    expect(screen.queryByText(/things? needs? you/i)).not.toBeInTheDocument();
  });
});

describe('TodayCard — footer always links to the full calendar, never a stale in-page anchor', () => {
  it('renders a "Full calendar" link regardless of today content', () => {
    render(<TodayCard events={[EVENT]} actionItems={[TASK]} />);
    const link = screen.getByRole('link', { name: /full calendar/i });
    expect(link).toHaveAttribute('href', '/golf/dashboard/calendar');
  });

  it('still renders the calendar link in the honest-empty state (never a dead-end card)', () => {
    render(<TodayCard events={[]} actionItems={[]} />);
    expect(screen.getByRole('link', { name: /full calendar/i })).toBeInTheDocument();
  });

  it('never links to the removed #action-center anchor', () => {
    render(<TodayCard events={[EVENT]} actionItems={[TASK]} />);
    expect(screen.queryByRole('link', { name: /see details/i })).not.toBeInTheDocument();
  });
});
