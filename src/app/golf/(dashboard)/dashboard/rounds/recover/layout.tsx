import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// L-004 (owner, 18 Nov 2026): recovering a round is a player's; a coach's address opens the team's Rounds instead of a lock.
export default async function RecoverRoundLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/rounds' });
  return children;
}
