import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: a player's page, game, print and genome are their Stats profile (owner, 2026-10-01: alias the not-rebuilt routes).
// A player has no coach's view of a player; theirs opens their own Stats (no `?player=`, which is the coach's form).
export default async function PlayerPagesLayout({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  await redirectToClubhouse({ coach: `/golf/dashboard/stats?player=${encodeURIComponent(playerId)}`, player: '/golf/dashboard/stats' });
  return children;
}
