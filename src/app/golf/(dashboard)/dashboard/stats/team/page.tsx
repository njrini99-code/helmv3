import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirectToClubhouse } from '@/clubhouse/routes/alias';
import { ClubhouseStatsRoute } from '@/clubhouse/routes/stats';

export const metadata: Metadata = {
  title: 'Team stats',
  description: 'View and compare statistics for all players on your team',
};

// Cache for 5 minutes
export const revalidate = 300;

export default async function TeamStatsPage(props?: { searchParams?: Promise<{ area?: string }> }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  // Whoever the dashboard draws as a player (no coach row, or a coach row whose dashboard role resolves to player) goes
  // to their own Stats (readiness audit, 2026-10-17). The address is on the frame's aliased list (nav.ts), so this runs.
  await redirectToClubhouse({ player: '/golf/dashboard/stats' });
  if (!session.coach) redirect('/golf/dashboard/stats'); // coach-only page

  // Team stats renders in place (a redirect() from a conditional branch is what crashed /stats, React #310).
  return <ClubhouseStatsRoute area={(await props?.searchParams)?.area} />;
}
