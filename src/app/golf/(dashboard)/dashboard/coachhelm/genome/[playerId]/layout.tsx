import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: a player's genome is their Stats profile (owner, 2026-10-01: alias the not-rebuilt routes); a player opens their own Stats.
export default async function GenomeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  await redirectToClubhouse({ coach: `/golf/dashboard/stats?player=${encodeURIComponent(playerId)}`, player: '/golf/dashboard/stats' });
  return children;
}
