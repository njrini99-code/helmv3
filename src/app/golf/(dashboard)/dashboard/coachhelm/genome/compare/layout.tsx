import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: comparing players is Team stats (owner, 2026-10-01: alias the not-rebuilt routes). Team stats is the
// coach's; a player opens their own Stats.
export default async function GenomeCompareLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/stats/team', player: '/golf/dashboard/stats' });
  return children;
}
