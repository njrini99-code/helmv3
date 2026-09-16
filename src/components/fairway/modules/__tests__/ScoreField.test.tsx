import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ScoreField, dateFraction, scoreFieldCap, scoreFieldTicks } from '../ScoreField';
import type { ScoreFieldRow } from '../types';

const DOMAIN = { start: '2026-06-01', end: '2026-09-10' };

const ROWS: ScoreFieldRow[] = [
  {
    id: 'p1',
    name: 'Alex Player',
    href: '/golf/dashboard/roster/p1',
    avg: 73.4,
    trend: { delta: -1.8, direction: 'improving' },
    rounds: [
      { id: 'r1', date: '2026-06-15', score: 75, toPar: 3, label: 'Jun 15, Links, 75 (+3)', href: '/golf/dashboard/rounds/r1' },
      { id: 'r2', date: '2026-08-02', score: 70, toPar: -2, label: 'Aug 2, Links, 70 (−2)', href: '/golf/dashboard/rounds/r2' },
      { id: 'r3', date: '2026-08-02', score: 72, toPar: 0, label: 'Aug 2, Links, 72 (E)' },
    ],
  },
  { id: 'p2', name: 'No Rounds', avg: null, trend: null, rounds: [] },
];

describe('ScoreField helpers', () => {
  it('positions a day inside the domain as a clamped percentage', () => {
    expect(dateFraction('2026-06-01', DOMAIN)).toBe(0);
    expect(dateFraction('2026-09-10', DOMAIN)).toBe(100);
    expect(dateFraction('2026-12-01', DOMAIN)).toBe(100);
    expect(dateFraction('2026-01-01', DOMAIN)).toBe(0);
    const mid = dateFraction('2026-07-21', DOMAIN);
    expect(mid).toBeGreaterThan(48);
    expect(mid).toBeLessThan(52);
  });

  it('caps the bar scale at the roster swing, between 4 and 12 strokes', () => {
    expect(scoreFieldCap(ROWS)).toBe(4);
    expect(scoreFieldCap([{ ...ROWS[0]!, rounds: [{ id: 'x', date: '2026-07-01', score: 90, toPar: 18, label: 'x' }] }])).toBe(12);
    expect(scoreFieldCap([{ ...ROWS[0]!, rounds: [{ id: 'x', date: '2026-07-01', score: 79, toPar: 7, label: 'x' }] }])).toBe(7);
  });

  it('ticks monthly for a long window and weekly for a short one', () => {
    const monthly = scoreFieldTicks(DOMAIN);
    expect(monthly.map((t) => t.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep']);
    expect(monthly[0]!.x).toBe(0);
    expect(monthly[3]!.x).toBeGreaterThan(90);
    // The right edge belongs to the Today marker, so a tick that lands on it is dropped.
    const weekly = scoreFieldTicks({ start: '2026-09-03', end: '2026-09-10' });
    expect(weekly.map((t) => t.label)).toEqual(['Sep 3']);
    expect(scoreFieldTicks(DOMAIN).every((t) => t.x <= 92)).toBe(true);
    const long = scoreFieldTicks({ start: '2025-06-01', end: '2026-09-10' });
    expect(long.filter((t) => t.label).length).toBeLessThan(long.length);
    expect(long.some((t) => t.label === "Jan 26")).toBe(true);
  });
});

describe('ScoreField', () => {
  it('renders a row per player with a bar per round, signed by par, and an honest empty row', () => {
    render(<ScoreField rows={ROWS} domain={DOMAIN} />);
    const table = screen.getByRole('table', { name: /rounds by player/i });
    const rows = within(table).getAllByRole('row').filter((r) => within(r).queryByRole('rowheader'));
    expect(rows).toHaveLength(2);

    const alex = rows[0]!;
    expect(within(alex).getByRole('link', { name: 'Alex Player' })).toHaveAttribute('href', '/golf/dashboard/roster/p1');
    expect(within(alex).getByRole('link', { name: 'Jun 15, Links, 75 (+3)' })).toHaveAttribute('href', '/golf/dashboard/rounds/r1');
    expect(within(alex).getByText('Aug 2, Links, 72 (E)')).toBeInTheDocument();
    expect(within(alex).getByText('73.4')).toBeInTheDocument();
    expect(within(alex).getByText('1.8')).toBeInTheDocument();
    expect(within(alex).getByText('strokes better')).toBeInTheDocument();

    const bars = alex.querySelectorAll('[class*="bg-fw-warning"], [class*="bg-accent-500"], [class*="bg-text-tertiary"]');
    expect(bars).toHaveLength(3);

    const empty = rows[1]!;
    expect(within(empty).getByText('No rounds in this window')).toBeInTheDocument();
    expect(within(empty).getByText('no read')).toBeInTheDocument();
  });

  it('ends the axis at Today', () => {
    render(<ScoreField rows={ROWS} domain={DOMAIN} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Jul')).toBeInTheDocument();
  });
});
