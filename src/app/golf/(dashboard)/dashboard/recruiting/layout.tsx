import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// L-004 (owner, 18 Nov 2026): Recruiting is a coach's page; a player's address opens their Home instead of a lock.
export default async function RecruitingLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ player: '/golf/dashboard' });
  return children;
}
