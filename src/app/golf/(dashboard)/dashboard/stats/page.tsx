import StatsClient from './stats-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { isRedesignEnabled } from '@/lib/redesign/flag';
import { FairwayPlayerStats } from '@/components/fairway/pages/coachhelm/FairwayPlayerStats';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stats | GolfHelm',
  description: 'View your golf performance statistics, strokes gained analysis, and scoring trends.',
};

// Stats are user-specific and should reflect the latest completed rounds immediately.
export const dynamic = 'force-dynamic';

/**
 * Golf Stats Page
 *
 * Performance optimizations:
 * 1. Initial load fetches only summary stats (fast - no shot data)
 * 2. Detailed shot-level stats are lazy loaded when user clicks a tab
 * 3. Stats are cached to prevent re-fetching
 * 4. Round selection reuses cached data when available
 *
 * This results in 3-5x faster initial page load for players with many rounds.
 */

interface GolfStatsPageProps {
  searchParams: Promise<{ player?: string }>;
}

export default async function GolfStatsPage({ searchParams }: GolfStatsPageProps) {
  const params = await searchParams;
  const playerId = params.player ?? null;

  // Flag-on: the data-rich Fairway player stats surface (single-player view).
  // It resolves the same player id the route resolves — `?player=` for a coach
  // viewing a teammate, else the logged-in player via useGolfUser() — and
  // renders in its own `.fairway-ds` scope on bg-canvas. Flag-off is unchanged.
  if (isRedesignEnabled()) {
    return (
      <div className="min-h-full bg-canvas">
        <FairwayPlayerStats initialPlayerId={playerId} />
      </div>
    );
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <StatsClient initialPlayerId={playerId} />
      </AnimatedItem>
    </AnimatedPage>
  );
}
