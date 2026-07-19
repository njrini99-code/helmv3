// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayTeamStats — per-player Trend cell never overflows its card (#104)
 * ----------------------------------------------------------------------------
 * Bug: the per-player stat grid's Trend cell rendered its arrow/label/
 * magnitude as a single `inline-flex` run with no width floor of its own. A
 * CSS grid item's default min-width is `auto` (its max-content size), so a
 * long run like "↘ Declining 3.2" could force the 2/4-col metric grid track
 * wider than the card, spilling the value text past the card's rounded
 * border instead of staying inside it.
 *
 * Fix: the Trend cell (and its value row) now carry `min-w-0` so the grid
 * item can shrink to its track's real width, plus `flex-wrap` so the arrow /
 * label / magnitude wrap onto a second line instead of forcing the track
 * wider when they don't fit on one. This is a class-contract regression
 * guard (jsdom doesn't do real layout/bbox measurement) — it locks in the
 * exact classes that make the overflow structurally impossible.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FairwayTeamStats } from './FairwayTeamStats';
import type { TeamPlayerStats } from '@/app/golf/(dashboard)/dashboard/stats/team/page';

function makePlayer(overrides: Partial<TeamPlayerStats> = {}): TeamPlayerStats {
  return {
    id: 'p1',
    first_name: 'Jordan',
    last_name: 'Lee',
    avatar_url: null,
    graduation_year: 2027,
    handicap: 2,
    rounds_played: 12,
    scoring_average: 74.2,
    best_round: 68,
    worst_round: 82,
    fairway_pct: 61,
    gir_pct: 55,
    putts_per_round: 29.4,
    birdies_per_round: 1.2,
    // A large-magnitude declining trend is the worst case for the value row's
    // width: "↘ Declining 3.2" is the longest realistic string this cell ever
    // renders.
    scoring_trend: 3.2,
    rounds_played_18: 10,
    rounds_played_9: 2,
    scoring_average_18: 74.0,
    scoring_average_9: 40.1,
    best_round_18: 68,
    best_round_9: 34,
    ...overrides,
  };
}

describe('FairwayTeamStats — Trend cell overflow guard', () => {
  it('renders a long trend value with min-w-0 + flex-wrap so it can never force the card wider', () => {
    render(
      <FairwayTeamStats
        teamName="Test Team"
        players={[makePlayer()]}
        intelligenceByPlayer={{}}
        leakMaps={null}
        standingByPlayer={new Map()}
      />,
    );

    // The magnitude span ("3.2") is unique to the per-player Trend cell (the
    // team-trajectory tile above only ever shows a headcount, never a signed
    // magnitude) — anchor on it rather than "Declining", which also appears
    // in that unrelated tile's trajectory label.
    const magnitude = screen.getByText('3.2');

    // The value row (arrow + label + magnitude) must be able to shrink below
    // its own max-content size (`min-w-0`) and wrap rather than force its grid
    // track — and therefore the card — wider than the viewport allows.
    const valueRow = magnitude.parentElement;
    expect(valueRow).not.toBeNull();
    expect(valueRow!.textContent).toContain('Declining');
    expect(valueRow!.className).toMatch(/min-w-0/);
    expect(valueRow!.className).toMatch(/flex-wrap/);

    // The cell's own flex-column wrapper carries the same floor.
    const cell = valueRow!.parentElement;
    expect(cell).not.toBeNull();
    expect(cell!.className).toMatch(/min-w-0/);
  });
});
