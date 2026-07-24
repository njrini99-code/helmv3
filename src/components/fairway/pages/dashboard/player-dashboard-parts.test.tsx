/**
 * ============================================================================
 * player-dashboard-parts — GenomeFingerprintTeaser radar overflow (audit #170)
 * ----------------------------------------------------------------------------
 * The strokes-gained radar's `PolarAngleAxis` labels (e.g. "Approach") can sit
 * past the recharts `<svg>`'s own box on a narrow card. Every non-root `<svg>`
 * gets `overflow: hidden` from the browser's UA stylesheet by default, so that
 * label clips hard at the SVG edge ("Approach" → "Approac") with nothing in
 * this component's own styling asking for it. jsdom has no layout engine, so
 * this can't assert a literal pixel measurement — it asserts the class-level
 * contract that makes that clip impossible in a real browser: the radar's
 * wrapper overrides every descendant `<svg>` to `overflow: visible`.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { GenomeFingerprintTeaser, TodayCard } from './player-dashboard-parts';
import type {
  StrokesGainedSnapshot,
  TodayEvent,
  ActionItem,
} from '@/app/golf/actions/dashboard-data';

const FULL_SG: StrokesGainedSnapshot = {
  sg_total: 1.2,
  sg_off_tee: 0.4,
  sg_approach: 0.9,
  sg_around_green: -0.2,
  sg_putting: 0.1,
};

describe('GenomeFingerprintTeaser — radar axis labels are never clipped by the SVG box', () => {
  it('wraps the radar in a container that overrides descendant <svg> overflow to visible', () => {
    const { container } = render(<GenomeFingerprintTeaser strokesGained={FULL_SG} />);

    const wrapper = Array.from(container.querySelectorAll<HTMLElement>('div')).find((el) =>
      el.className.includes('[&_svg]:overflow-visible'),
    );
    expect(wrapper).toBeDefined();
  });
});

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
