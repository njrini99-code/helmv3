import type { Metadata } from 'next';
import { ClubhouseStatsRoute } from '@/clubhouse/routes/stats';
import type { ChFilterQuery } from '@/clubhouse/data/stats-filter';

export const metadata: Metadata = {
  title: 'Stats',
  description: 'View your golf performance statistics, strokes gained analysis, and scoring trends.',
};

// Stats are user-specific and should reflect the latest completed rounds immediately.
export const dynamic = 'force-dynamic';

interface GolfStatsPageProps {
  searchParams: Promise<{ player?: string; tab?: string; area?: string; window?: string } & ChFilterQuery>;
}

export default async function GolfStatsPage({ searchParams }: GolfStatsPageProps) {
  // Clubhouse Stats: team stats and player profiles, coaches and players, each with the permissions they already have.
  const params = await searchParams;
  return <ClubhouseStatsRoute player={params.player} window={params.window} tab={params.tab} area={params.area} query={params} />;
}
