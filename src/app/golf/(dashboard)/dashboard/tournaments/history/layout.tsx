import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// L-004 (owner, 18 Nov 2026): tournaments/history is a coach's page; a player's address opens Tournaments instead of a lock.
export default async function TournamentHistoryLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ player: '/golf/dashboard/tournaments' });
  return children;
}
