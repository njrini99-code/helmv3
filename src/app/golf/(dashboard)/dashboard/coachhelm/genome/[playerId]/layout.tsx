import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: a player's genome is their Stats profile (owner, 2026-10-01: alias the not-rebuilt routes).
// Not reached today (Clubhouse A+ A30, G2): next.config redirects /coachhelm/genome/<id> to /players/<id>/genome before any
// layout runs, and this folder has no page, so the players layout's redirect is the one that fires. Kept as the guard for
// an address that ever stops being redirected.
export default async function GenomeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  await redirectToClubhouse({ coach: `/golf/dashboard/stats?player=${encodeURIComponent(playerId)}` });
  return children;
}
