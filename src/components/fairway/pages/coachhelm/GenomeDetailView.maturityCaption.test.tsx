// @vitest-environment jsdom
/**
 * ============================================================================
 * GenomeDetailView — the maturity caption's denominator
 * ----------------------------------------------------------------------------
 * The dimension grid is captioned
 *
 *     "0 of 8 dimensions live · more land as data matures"
 *
 * and one of those eight is `weather_sensitivity_stub`, which carries
 * `neverAvailable: true`. That flag exists for exactly one reason, quoted from
 * its own docblock in genome/types.ts:
 *
 *     "Drives a separate 'Not tracked' UI treatment so coaches don't read it
 *      as 'will unlock eventually.'"
 *
 * GenomeDetailView.notTracked.test.tsx pinned that treatment for the CELL. The
 * caption above the grid was missed, and it makes the promise the flag exists
 * to prevent — at the aggregate level, where a coach actually reads it. There
 * is no amount of golf that makes the weather spoke resolve: the dimension is a
 * permanent stub because no weather or temperature is recorded in shot data at
 * all. It needs a feature to ship, not more rounds.
 *
 * Observed in production 2026-08-18 on Samanyu Bedi (Guilford), whose genome
 * page reads "0 of 8 dimensions live · more land as data matures" directly
 * above a grid where WEATHER SENSITIVITY says "NOT TRACKED" and the other seven
 * say "NEEDS MORE ROUNDS". The page states both things at once.
 *
 * The honest denominator is the number of dimensions that can actually become
 * live. Untracked ones are not part of the maturity story and are surfaced in
 * their own right, in the grid.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenomeDetailView } from './GenomeDetailView';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/golf/dashboard/coachhelm/genome/player-1',
}));

vi.mock('./CoachHelmShell', () => ({
  CoachHelmShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** Every dimension locked, exactly as a 2-round player's genome comes back. */
function emptyVector(): GenomeVector {
  const vector: GenomeVector = {};
  for (const dim of GENOME_DIMENSIONS) {
    vector[dim.id] = dim.compute({
      player_id: 'player-1',
      recent_rounds_count: 0,
      rounds: [],
      hole_scores: [],
      shots: [],
    });
  }
  return vector;
}

const TRACKABLE = GENOME_DIMENSIONS.filter((d) => d.neverAvailable !== true).length;
const UNTRACKABLE = GENOME_DIMENSIONS.length - TRACKABLE;

function renderView() {
  render(
    <GenomeDetailView
      playerId="player-1"
      playerName="Test Player"
      genome={{ vector: emptyVector(), computed_at: new Date().toISOString(), rounds_basis: 2 }}
      persona={null}
    />,
  );
}

describe('GenomeDetailView — maturity caption', () => {
  it('fixture guard: at least one dimension is permanently unavailable', () => {
    // If this ever goes to zero the caption is trivially correct and the rest
    // of this suite is meaningless — better to fail loudly than pass vacuously.
    expect(UNTRACKABLE).toBeGreaterThan(0);
  });

  it('counts only dimensions that can actually become live', () => {
    renderView();
    expect(
      screen.getByText(new RegExp(`0 of ${TRACKABLE} dimensions live`)),
    ).toBeInTheDocument();
  });

  it('does not promise that a permanently untracked dimension will land with more data', () => {
    renderView();
    expect(
      screen.queryByText(new RegExp(`of ${GENOME_DIMENSIONS.length} dimensions live`)),
      `the denominator still counts the ${UNTRACKABLE} dimension(s) that can never resolve`,
    ).not.toBeInTheDocument();
  });

  it('still accounts for the untracked dimensions rather than hiding them', () => {
    // Dropping them from the denominator must not drop them from the page —
    // a coach should be able to see that the count excludes something. The
    // treatment is carried on the cell's aria-label (see the sibling
    // GenomeDetailView.notTracked.test.tsx), not as body text.
    renderView();
    expect(screen.getByLabelText('Weather sensitivity: not tracked')).toBeInTheDocument();
  });
});
