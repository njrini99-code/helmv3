import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: Live is rebuilt for the coach (routes/live.tsx); a player has no such page, so theirs opens Home.
export default async function LiveLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ player: '/golf/dashboard' });
  return children;
}
