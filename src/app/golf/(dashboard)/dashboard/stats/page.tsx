import { redirect } from 'next/navigation';
import StatsClient from './stats-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { isRedesignEnabled } from '@/lib/redesign/flag';
import { FairwayPlayerStats } from '@/components/fairway/pages/coachhelm/FairwayPlayerStats';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { coachHelmRoutes } from '@/lib/coachhelm/fairway-routes';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stats | GolfHelm',
  description: 'View your golf performance statistics, strokes gained analysis, and scoring trends.',
};

export const dynamic = 'force-dynamic';

interface GolfStatsPageProps {
  searchParams: Promise<{ player?: string; tab?: string }>;
}

/**
 * Player own-stats home (`/stats`).
 *
 * Coach paths:
 *   • coach-only → `/stats/team`
 *   • `?player=` → `/stats/players/[id]` (legacy query redirect)
 */
export default async function GolfStatsPage({ searchParams }: GolfStatsPageProps) {
  const params = await searchParams;
  const playerId = params.player ?? null;
  const tab = params.tab ?? null;

  if (isRedesignEnabled()) {
    const session = await getGolfSessionProfile();

    if (playerId) {
      const query = tab ? `?tab=${encodeURIComponent(tab)}` : '';
      redirect(`${coachHelmRoutes.playerStats(playerId)}${query}`);
    }

    if (session?.coach && !session.player) {
      redirect(coachHelmRoutes.teamStats);
    }

    return <FairwayPlayerStats />;
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <StatsClient initialPlayerId={playerId} />
      </AnimatedItem>
    </AnimatedPage>
  );
}
