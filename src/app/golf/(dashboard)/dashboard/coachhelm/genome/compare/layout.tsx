import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: comparing players is Team stats (owner, 2026-10-01: alias the not-rebuilt routes).
export default async function GenomeCompareLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/stats/team' });
  return children;
}
