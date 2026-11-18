import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: comparing players is Team stats (owner, 2026-10-01: alias the not-rebuilt routes), which is Stats itself (GAP-R-10).
export default async function GenomeCompareLayout({ children }: { children: React.ReactNode }) {
  // L-004 (owner, 18 Nov 2026): a player's address opens their own Stats instead of a lock.
  await redirectToClubhouse({ coach: '/golf/dashboard/stats', player: '/golf/dashboard/stats' });
  return children;
}
