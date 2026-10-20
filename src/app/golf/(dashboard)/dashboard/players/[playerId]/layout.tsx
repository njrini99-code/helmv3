import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: a player's page, game, print and genome are their Stats profile (owner, 2026-10-01: alias the not-rebuilt routes).
export default async function PlayerPagesLayout({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  await redirectToClubhouse({ coach: `/golf/dashboard/stats?player=${encodeURIComponent(playerId)}` });
  return children;
}
