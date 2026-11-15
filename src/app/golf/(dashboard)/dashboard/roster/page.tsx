import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { ClubhouseRosterRoute } from '@/clubhouse/routes/roster';

export const metadata: Metadata = {
  title: 'Roster',
  description: 'Manage your golf team roster, view player stats, and track team performance',
};

// Cache roster page for 1 minute (balance between freshness and performance)
export const revalidate = 60;

export default async function GolfRosterPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  // Clubhouse Roster: a coach gets the coach's roster; a player gets their team's roster, read-only.
  return <ClubhouseRosterRoute />;
}
