import StatsClient from './stats-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

// Cache stats page for 2 minutes (stats update moderately often)
export const revalidate = 120;

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

  return (
    <AnimatedPage>
      <AnimatedItem>
        <StatsClient initialPlayerId={playerId} />
      </AnimatedItem>
    </AnimatedPage>
  );
}
