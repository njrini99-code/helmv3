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
import { LeakBoard, type LeakInsight } from './LeakBoard';

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
