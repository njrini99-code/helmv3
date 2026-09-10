/**
 * ============================================================================
 * player-dashboard-parts — the player home stage and its instruments (v2)
 * ----------------------------------------------------------------------------
 * player-home.v2.md: the stage answers "am I getting better" with the score
 * trajectory (last round marked, own average dashed) and a verdict sentence
 * derived from ONE series; the strokes-gained zones read as a diverging
 * tornado; today's tasks are seam rows under the schedule. These lock the
 * honesty rules (never a fabricated trace, never a takeaway below three
 * zones) and the copy contracts the page relies on.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  PlayerStage,
  TodayTasks,
  scoringVerdict,
  sgFacetRows,
  sgTakeaway,
  sortActionItems,
} from './player-dashboard-parts';
import type { StrokesGainedSnapshot, ActionItem } from '@/app/golf/actions/dashboard-data';

/* ─────────────────────────────────────────────────────────────────────────
 * The stage
 * ──────────────────────────────────────────────────────────────────────── */

const POINTS = [
  { x: 'Jun 10', y: 76 },
  { x: 'Jun 20', y: 78 },
  { x: 'Jul 1', y: 74 },
];
const LAST = { id: 'r1', course_name: 'Pinehurst No. 2', round_date: '2026-07-01' };

describe('PlayerStage — the score trajectory with the last round marked', () => {
  it('names the newest round in the readout, marks it on the trace, and draws the own-average benchmark', () => {
    render(
      <PlayerStage
        points={POINTS}
        lastRound={LAST}
        scoringAverage={76.2}
        trend={{ value: -1.8, direction: 'improving', points: 5 }}
      />,
    );
    expect(screen.getByText('Pinehurst No. 2 · Jul 1')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="ribbon-last-marker"]')).not.toBeNull();
    expect(screen.getByText('Avg 76.2')).toBeInTheDocument();
    // The headline is the verdict sentence, from the trend the caller passed.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Down 1.8 over your last 5 rounds.' }),
    ).toBeInTheDocument();
    // The delta caption names what the delta compares against (the first plotted round).
    expect(screen.getByText(/vs Jun 10/)).toBeInTheDocument();
  });

  it('below three scored rounds the instrument is honestly awaiting: no trace, no marker, no fake line', () => {
    render(
      <PlayerStage points={POINTS.slice(0, 2)} lastRound={LAST} scoringAverage={null} trend={null} />,
    );
    expect(screen.getByText(/Awaiting points/)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="ribbon-last-marker"]')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Your trend draws after a few more rounds.' }),
    ).toBeInTheDocument();
  });
});

describe('scoringVerdict — one sentence from the SAME series the form strip uses', () => {
  it('reads a falling scoring average as "Down" (scores are lower-is-better)', () => {
    expect(scoringVerdict({ value: -1.8, direction: 'improving', points: 5 }, 74.4)).toBe(
      'Down 1.8 over your last 5 rounds.',
    );
  });
  it('reads a rising scoring average as "Up"', () => {
    expect(scoringVerdict({ value: 0.9, direction: 'declining', points: 5 }, 74.4)).toBe(
      'Up 0.9 over your last 5 rounds.',
    );
  });
  it('a flat trend holds around the average; no trend yet scores around it; nothing at all says so', () => {
    expect(scoringVerdict({ value: 0, direction: 'flat', points: 4 }, 74.4)).toBe('Holding around 74.4.');
    expect(scoringVerdict(null, 74.4)).toBe('Scoring around 74.4.');
    expect(scoringVerdict(null, null)).toBe('Your trend draws after a few more rounds.');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * Where your strokes go
 * ──────────────────────────────────────────────────────────────────────── */

const FULL_SG: StrokesGainedSnapshot = {
  sg_total: 1.2,
  sg_off_tee: 0.4,
  sg_approach: 0.9,
  sg_around_green: -0.2,
  sg_putting: 0.1,
};

describe('sgFacetRows / sgTakeaway — four zones, honest below three', () => {
  it('maps the four zones in course order and drops null facets', () => {
    expect(sgFacetRows(FULL_SG).map((r) => r.label)).toEqual(['Tee', 'App', 'ATG', 'Putt']);
    expect(sgFacetRows({ ...FULL_SG, sg_approach: null, sg_putting: null })).toHaveLength(2);
    expect(sgFacetRows(null)).toEqual([]);
  });

  it('names the best and the worst zone, and never claims a takeaway below three zones', () => {
    expect(sgTakeaway(sgFacetRows(FULL_SG))).toBe('Gaining most on approach, leaking most around the green.');
    expect(sgTakeaway(sgFacetRows({ ...FULL_SG, sg_around_green: 0.05 }))).toBe(
      'Gaining in every zone; the thinnest edge is around the green.',
    );
    expect(sgTakeaway(sgFacetRows({ ...FULL_SG, sg_approach: null, sg_putting: null }))).toBeUndefined();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * Today's tasks
 * ──────────────────────────────────────────────────────────────────────── */

const TASK: ActionItem = { id: 't1', type: 'task', title: 'Submit round', date: '2026-07-22', overdue: false };
const OVERDUE: ActionItem = { id: 't2', type: 'task', title: 'Sign the waiver', date: '2026-07-20', overdue: true };
const NOTE: ActionItem = { id: 'a1', type: 'announcement', title: 'Van leaves at 6', date: '2026-07-22' };
const DEADLINE: ActionItem = { id: 'd1', type: 'deadline', title: 'Qualifier entry', date: '2026-07-25' };

describe('TodayTasks — seam rows under the schedule, overdue first, three at most', () => {
  it('orders overdue, then open tasks, then deadlines, then announcements', () => {
    expect(sortActionItems([NOTE, TASK, DEADLINE, OVERDUE]).map((a) => a.id)).toEqual(['t2', 't1', 'd1', 'a1']);
  });

  it('renders at most three rows plus the calendar row, with the total count in the heading line', () => {
    render(<TodayTasks actionItems={[NOTE, TASK, DEADLINE, OVERDUE]} />);
    expect(screen.getByText('Sign the waiver')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Submit round')).toBeInTheDocument();
    expect(screen.getByText('Qualifier entry')).toBeInTheDocument();
    expect(screen.queryByText('Van leaves at 6')).not.toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /full calendar/i })).toHaveAttribute('href', '/golf/dashboard/calendar');
    // The old Today card's restated preview copy must never come back.
    expect(screen.queryByText(/things? needs? you/i)).not.toBeInTheDocument();
  });

  it('renders nothing when there are no items (the schedule above already says what is on)', () => {
    const { container } = render(<TodayTasks actionItems={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
