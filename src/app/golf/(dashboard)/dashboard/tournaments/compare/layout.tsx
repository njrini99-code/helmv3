import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// L-004 (owner, 18 Nov 2026): tournaments/compare is a coach's page; a player's address opens Tournaments instead of a lock.
export default async function TournamentCompareLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ player: '/golf/dashboard/tournaments' });
  return children;
}
