// @vitest-environment jsdom
/**
 * ============================================================================
 * TrajectoryCard (#1485) — data present, honest empty, reduced-motion gating
 * ----------------------------------------------------------------------------
 * Pins four things this card must never regress:
 *   1. With a real forecast, it shows the sample basis (rounds + window) and
 *      the horizon-point confidence band — never a bare chart with no basis.
 *   2. `trajectory === null` (the forecaster's own `rounds.length < 10` gate)
 *      renders the honest `InsufficientData` state, never a fabricated flat
 *      line.
 *   3. `trajectory === undefined` (auth/rate-limit/disabled/unexpected —
 *      i.e. NOT insufficient history) renders a DIFFERENT, neutral message —
 *      never the "not enough rounds" copy, which would be false for a
 *      player with plenty of round history who just hit a rate limit.
 *   4. Its own entrance motion is gated through `useReducedMotionGuard`:
 *      `initial` is the real object normally, and `false` (skip-entrance)
 *      under reduced motion — never the raw ungated hook.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrajectoryCard } from './TrajectoryCard';
import type { PlayerTrajectorySummary } from '@/lib/coachhelm/v2/types';

// Same technique as ViewSwitch.test.tsx: replace framer-motion with a
// deterministic passthrough so `useReducedMotionGuard` (which just wraps
// framer-motion's `useReducedMotion`) resolves predictably in jsdom, and
// forward the card's own `initial` prop as a `data-initial` attribute so its
// value is directly assertable instead of relying on framer-motion internals.
const motionState = vi.hoisted(() => ({ reducedMotion: false as boolean }));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => motionState.reducedMotion,
    motion: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>(({ children, initial, animate, transition, ...rest }, ref) => {
            void animate;
            void transition;
            return React.createElement(
              prop as string,
              {
                ...rest,
                ref,
                'data-initial': initial === false ? 'false' : initial ? JSON.stringify(initial) : '',
              },
              children,
            );
          }),
      },
    ),
  };
});

function makeForecast(overrides: Partial<PlayerTrajectorySummary> = {}): PlayerTrajectorySummary {
  return {
    horizonDays: 90,
    projections: [
      { date: '2026-08-20', metric: 'scoring_average', value: 2.4, rangeLow: 1.9, rangeHigh: 2.9, confidence: 0.82 },
      { date: '2026-08-27', metric: 'scoring_average', value: 2.2, rangeLow: 1.6, rangeHigh: 2.8, confidence: 0.79 },
      { date: '2026-09-03', metric: 'scoring_average', value: 2.0, rangeLow: 1.3, rangeHigh: 2.7, confidence: 0.76 },
      { date: '2026-11-18', metric: 'scoring_average', value: 0.9, rangeLow: -0.4, rangeHigh: 2.2, confidence: 0.61 },
    ],
    modelConfidence: 0.72,
    roundsAnalyzed: 24,
    ...overrides,
  };
}

describe('TrajectoryCard — data present', () => {
  it('shows the sample basis and the horizon-point confidence band, never a bare chart', () => {
    render(<TrajectoryCard trajectory={makeForecast()} />);

    // Sample basis (CoachHelm honesty rules: N rounds + window always visible).
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText(/rounds, 90-day window/)).toBeInTheDocument();

    // Framed as a projection, not advice.
    expect(screen.getByText(/statistical projection, not advice/i)).toBeInTheDocument();

    // Horizon-point confidence band from the LAST projection point (+0.9, range -0.4 to +2.2).
    expect(screen.getByText(/Day 90 confidence band/)).toBeInTheDocument();
    expect(screen.getByText(/-0.4 to \+2.2/)).toBeInTheDocument();
    expect(screen.getByText(/72% model confidence/)).toBeInTheDocument();
  });
});

describe('TrajectoryCard — insufficient data (trajectory === null)', () => {
  it('renders the honest InsufficientData state when the forecaster found too little history', () => {
    render(<TrajectoryCard trajectory={null} />);

    expect(screen.getByText('Not enough rounds for a trajectory yet')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    // Never a fabricated chart or a bare 0 in this state.
    expect(screen.queryByText(/confidence band/i)).not.toBeInTheDocument();
  });

  it('renders the same honest state for an empty-projections forecast', () => {
    render(<TrajectoryCard trajectory={makeForecast({ projections: [] })} />);
    expect(screen.getByText('Not enough rounds for a trajectory yet')).toBeInTheDocument();
  });
});

describe('TrajectoryCard — unavailable (trajectory === undefined, NOT insufficient history)', () => {
  it('renders a neutral "unavailable" message, never the "not enough rounds" claim', () => {
    render(<TrajectoryCard trajectory={undefined} />);

    expect(screen.getByText('Trajectory unavailable right now')).toBeInTheDocument();
    // The critical regression this guards: a rate-limited/disabled/errored
    // fetch must NOT be presented as "not enough rounds" — that's a false
    // claim for a player who may have plenty of round history.
    expect(screen.queryByText('Not enough rounds for a trajectory yet')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('TrajectoryCard — reduced motion (useReducedMotionGuard, not the raw hook)', () => {
  it('passes the real entrance object as `initial` by default', () => {
    motionState.reducedMotion = false;
    const { container } = render(<TrajectoryCard trajectory={makeForecast()} className="tc" />);
    const wrapper = container.querySelector('.tc');
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute('data-initial', JSON.stringify({ opacity: 0, y: 8 }));
  });

  it('sets `initial={false}` (skips the entrance) under reduced motion', () => {
    motionState.reducedMotion = true;
    const { container } = render(<TrajectoryCard trajectory={makeForecast()} className="tc" />);
    const wrapper = container.querySelector('.tc');
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute('data-initial', 'false');
    motionState.reducedMotion = false; // reset for any test ordering
  });
});
