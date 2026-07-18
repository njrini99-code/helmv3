// @vitest-environment jsdom
/**
 * ============================================================================
 * LeakBoard — "str/rd" honesty regression guard
 * ----------------------------------------------------------------------------
 * The per-category total is a SUM of `strokes_impact` across every leak
 * insight for every player in that category — NOT a per-round rate. It used
 * to be labeled "str/rd" (a per-round unit), which read as though a −26.4
 * total meant the team lost 26 strokes EVERY round — ~8x the genuine team
 * SG-putting figure (~−3.19/rd). This locks the honest "total" label so a
 * regression back to "str/rd" (or an equivalent per-round claim) fails.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LeakBoard, resolveFlameThreshold, type LeakInsight } from './LeakBoard';

function makeLeak(overrides: Partial<LeakInsight> = {}): LeakInsight {
  return {
    id: 'leak-1',
    category: 'putting',
    title: 'Three-putt rate is climbing',
    strokesImpact: 1.5,
    priority: 'high',
    playerName: 'player-1',
    ...overrides,
  };
}

describe('LeakBoard — honest units', () => {
  it('labels the summed total "total", never "str/rd" (a per-round claim it cannot back)', () => {
    render(
      <LeakBoard
        insights={[
          makeLeak({ id: 'a', playerName: 'player-1', strokesImpact: 2 }),
          makeLeak({ id: 'b', playerName: 'player-2', strokesImpact: 3 }),
        ]}
      />,
    );
    expect(screen.getAllByText('total').length).toBeGreaterThan(0);
    expect(screen.queryByText('str/rd')).toBeNull();
  });

  it('sums the magnitude across every leak/player in a category (never averages or divides by round count)', () => {
    render(
      <LeakBoard
        insights={[
          makeLeak({ id: 'a', playerName: 'player-1', strokesImpact: 2, category: 'putting' }),
          makeLeak({ id: 'b', playerName: 'player-2', strokesImpact: 3, category: 'putting' }),
        ]}
      />,
    );
    // 2 + 3 = 5.0, not an average (2.5) and not a single player's figure.
    expect(screen.getByText('−5.0')).toBeInTheDocument();
  });

  it('never claims a per-round rate in the summary sentence', () => {
    render(
      <LeakBoard
        insights={[makeLeak({ id: 'a', playerName: 'player-1' })]}
      />,
    );
    const summary = screen.getByText(/leak/i, { selector: 'p' });
    expect(summary.textContent).not.toMatch(/per round|str\/rd/i);
  });

  it('renders the honest empty state when there are no leaks', () => {
    render(<LeakBoard insights={[]} />);
    expect(screen.getByText(/No live leaks right now/i)).toBeInTheDocument();
  });
});

/**
 * ============================================================================
 * Bug #949 #4 — "high bleed" must differentiate rows, not fire on every one.
 * The old flat 0.8 threshold was tiny next to any real category total, so
 * −33.5, −4.4, and −1.4 all read "· high bleed" alike. `resolveFlameThreshold`
 * now reads relative to the board's own worst category (see LeakBoard.tsx).
 * ========================================================================== */
describe('LeakBoard — tiered "high bleed" (bug #949 #4)', () => {
  it('only the dominant category is flagged when totals vary widely (−33.5 vs −4.4 vs −1.4)', () => {
    render(
      <LeakBoard
        insights={[
          makeLeak({ id: 'a', playerName: 'player-1', category: 'putting', strokesImpact: 33.5 }),
          makeLeak({ id: 'b', playerName: 'player-2', category: 'approach', strokesImpact: 4.4 }),
          makeLeak({ id: 'c', playerName: 'player-3', category: 'tee', strokesImpact: 1.4 }),
        ]}
      />,
    );
    const flags = screen.getAllByText('high bleed', { exact: false });
    expect(flags).toHaveLength(1);
    // The flag sits in the putting row (−33.5), not approach or tee.
    const puttingRow = screen.getByText('Putting').closest('div')?.parentElement;
    expect(puttingRow?.textContent).toContain('high bleed');
  });

  it('flags nothing when every category is small and comparably sized (no fabricated severity)', () => {
    render(
      <LeakBoard
        insights={[
          makeLeak({ id: 'a', playerName: 'player-1', category: 'putting', strokesImpact: 1.2 }),
          makeLeak({ id: 'b', playerName: 'player-2', category: 'approach', strokesImpact: 1.0 }),
        ]}
      />,
    );
    expect(screen.queryByText('high bleed', { exact: false })).toBeNull();
  });

  it('an explicit flameThreshold override still wins over the relative default', () => {
    render(
      <LeakBoard
        insights={[makeLeak({ id: 'a', playerName: 'player-1', category: 'putting', strokesImpact: 1.2 })]}
        flameThreshold={0.5}
      />,
    );
    expect(screen.getByText('high bleed', { exact: false })).toBeInTheDocument();
  });
});

describe('resolveFlameThreshold', () => {
  it('is half the board max, with a 3-stroke floor', () => {
    expect(resolveFlameThreshold(33.5)).toBeCloseTo(16.75);
    expect(resolveFlameThreshold(4)).toBe(3); // half of 4 is 2, floored to 3
  });

  it('an explicit override always wins', () => {
    expect(resolveFlameThreshold(33.5, 0.8)).toBe(0.8);
  });
});
