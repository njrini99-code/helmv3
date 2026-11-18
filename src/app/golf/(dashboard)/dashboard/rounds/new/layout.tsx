import { Metadata } from 'next';
import { redirectToClubhouse } from '@/clubhouse/routes/alias';

export const metadata: Metadata = {
  title: 'New round',
  description: 'Track your golf round shot-by-shot with comprehensive statistics including driving distance, approach accuracy, and putting performance',
};

// L-004 (owner, 18 Nov 2026): logging a round is a player's; a coach's address opens the team's Rounds instead of a lock.
export default async function NewRoundLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/rounds' });
  return children;
}
