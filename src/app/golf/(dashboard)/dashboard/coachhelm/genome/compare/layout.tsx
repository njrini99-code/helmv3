import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: comparing players is Team stats (owner, 2026-10-01: alias the not-rebuilt routes), which is Stats itself (GAP-R-10).
export default async function GenomeCompareLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/stats' });
  return children;
}
