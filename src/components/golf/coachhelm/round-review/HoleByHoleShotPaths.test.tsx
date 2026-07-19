import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HoleByHoleShotPaths } from './HoleByHoleShotPaths';

/**
 * #34 dead-control guard: the Round Review "Jump to hole" chip nav scrolls to
 * per-hole shot cards that only exist when shot-level data was logged. The page
 * gates that nav on this component's onShotsLoaded(hasShots) callback, so a
 * scorecard-only round (no shots) must report false — otherwise the pills
 * render but silently do nothing (a dishonest control).
 */

let mockRows: unknown[] = [];
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const result = { data: mockRows, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      then: (resolve: (v: typeof result) => unknown) => resolve(result),
    };
    return { from: () => chain };
  },
}));
vi.mock('@/components/golf/coachhelm/v3/HoleShotPath', () => ({
  HoleShotPath: () => <div data-testid="hole-card" className="max-w-[240px]" />,
}));
vi.mock('@/components/golf/coachhelm/round-review/RoundStripGrid', () => ({
  RoundStripGrid: () => <div data-testid="strip-grid" />,
}));

const holes = [
  { hole_number: 1, par: 4, yardage: 400, score: 4 },
  { hole_number: 2, par: 3, yardage: 180, score: 3 },
];

describe('HoleByHoleShotPaths — onShotsLoaded contract (#34 dead-control guard)', () => {
  beforeEach(() => {
    mockRows = [];
  });

  it('reports hasShots=false for a scorecard-only round (nav stays hidden)', async () => {
    mockRows = [];
    const onShotsLoaded = vi.fn();
    render(<HoleByHoleShotPaths roundId="r1" holes={holes} onShotsLoaded={onShotsLoaded} />);
    await waitFor(() => expect(onShotsLoaded).toHaveBeenCalledWith(false));
    expect(screen.getByText(/No shot-level data was logged/i)).toBeInTheDocument();
  });

  it('reports hasShots=true when the ledger has shots (nav renders)', async () => {
    mockRows = [
      {
        hole_number: 1,
        shot_number: 1,
        lie_before: 'tee',
        lie_after: 'fairway',
        distance_to_hole_before: 400,
        distance_to_hole_after: 150,
        miss_direction: null,
        is_penalty: false,
      },
    ];
    const onShotsLoaded = vi.fn();
    render(<HoleByHoleShotPaths roundId="r1" holes={holes} onShotsLoaded={onShotsLoaded} />);
    await waitFor(() => expect(onShotsLoaded).toHaveBeenCalledWith(true));
    expect(screen.getAllByTestId('hole-card').length).toBeGreaterThan(0);
  });
});
