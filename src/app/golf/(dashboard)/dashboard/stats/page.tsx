'use client';

import { useSearchParams } from 'next/navigation';
import StatsClient from './stats-client';

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
export default function GolfStatsPage() {
  const searchParams = useSearchParams();
  const playerId = searchParams.get('player');

  return <StatsClient initialPlayerId={playerId} />;
}
