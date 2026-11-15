import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { ClubhouseRoundsRoute } from '@/clubhouse/routes/rounds';
import { ClubhouseTeamRoundsRoute } from '@/clubhouse/routes/team-rounds';

export const metadata: Metadata = {
  title: 'Rounds',
  description: 'View and manage all golf rounds for your team. Track scores, stats, and player performance over time.',
};

// Rounds are player-specific and should reflect new saves/completions immediately.
export const dynamic = 'force-dynamic';

export default async function RoundsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { role: userRole, coach, player } = session;
  if (!userRole) redirect('/golf/login');

  // The player's library, or for a coach every round the team has posted. The role is the dashboard layout's
  // (getGolfDashboardRole).
  const role = await getGolfDashboardRole();
  if (role === 'player' && player) return <ClubhouseRoundsRoute />;
  if (role === 'coach' && coach) return <ClubhouseTeamRoundsRoute />;
  return null;
}
