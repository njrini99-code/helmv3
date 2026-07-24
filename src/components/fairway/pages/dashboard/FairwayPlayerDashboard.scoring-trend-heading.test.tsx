/**
 * ============================================================================
 * FairwayPlayerDashboard — Scoring trend heading (audit #169)
 * ----------------------------------------------------------------------------
 * The "Scoring trend" section rendered its page-level `<SectionTitle>` heading
 * AND handed the identical string to `TrendChart`'s own `title` prop, which
 * ChartFrame renders into a second, `truncate`-d `<h3>` inside the card. Once
 * the header row's "View as table" toggle squeezed that inner h3, it clipped
 * to "Scoring tre…" — a duplicated AND clipped heading. The fix passes
 * `title={null}` to TrendChart (same pattern GenomeFingerprintTeaser already
 * uses below it) so the SectionTitle above is the ONE heading for this card.
 *
 * This locks: exactly one "Scoring trend" heading renders on the page, and
 * ChartFrame's inner title slot is empty (no second copy to ever clip).
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FairwayPlayerDashboard, type PlayerDashboardData } from './FairwayPlayerDashboard';
import type { GolfPlayer, GolfTeam } from '@/lib/types/golf';

// PlayerFocusAreas self-fetches via a server action that needs real Supabase
// env vars — irrelevant to this heading-dedup test, so stub it out rather
// than let it reject in the background (noisy, unrelated unhandled rejection).
vi.mock('@/components/golf/coachhelm/insights', () => ({
  PlayerFocusAreas: () => null,
}));

function playerData(): PlayerDashboardData {
  return {
    player: { id: 'player-1', first_name: 'Riley' } as GolfPlayer,
    team: { id: 'team-1', name: 'Rini University' } as GolfTeam,
    stats: {
      roundsPlayed: 4,
      scoringAverage: 76.2,
      bestRound: 71,
      handicap: 6.4,
      recentTrend: 'improving',
    },
    recentRounds: [
      { id: 'r1', course_name: 'Pinehurst No. 2', total_score: 74, total_to_par: 2, round_date: '2026-07-01' },
      { id: 'r2', course_name: 'Pinehurst No. 2', total_score: 78, total_to_par: 6, round_date: '2026-06-20' },
      { id: 'r3', course_name: 'Pinehurst No. 2', total_score: 76, total_to_par: 4, round_date: '2026-06-10' },
    ],
  };
}

describe('FairwayPlayerDashboard — Scoring trend has exactly one heading', () => {
  it('renders "Scoring trend" once as the page section title, not again inside the chart card', () => {
    render(<FairwayPlayerDashboard data={playerData()} />);

    const headings = screen.getAllByText('Scoring trend');
    expect(headings).toHaveLength(1);
    // It's the real page-level <h2> SectionTitle, not a ChartFrame <h3>.
    expect(headings[0]!.tagName).toBe('H2');
  });
});

describe('FairwayPlayerDashboard — top slot is the swipe calendar, not the game-trend hero', () => {
  it('renders "Your schedule" and never the "gaining most" hero copy (founder call 2026-07-24)', () => {
    render(<FairwayPlayerDashboard data={playerData()} />);

    expect(screen.getByText('Your schedule')).toBeInTheDocument();
    expect(screen.queryByText(/gaining most/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/See where you stack up/i)).not.toBeInTheDocument();
  });
});
