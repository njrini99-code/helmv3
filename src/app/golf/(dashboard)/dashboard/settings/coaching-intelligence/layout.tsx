import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { ClubhouseSettingsRoute } from '@/clubhouse/routes/settings';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';

export const metadata: Metadata = {
  title: 'Coaching Intelligence',
  description: 'Configure your coaching philosophy, alert thresholds, and AI insight preferences.',
};

export default async function CoachingIntelligenceLayout(_props: { children: React.ReactNode }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  // This old link opens Settings at CoachHelm for a coach; a player lands on their own Settings.
  const role = await getGolfDashboardRole();
  return <ClubhouseSettingsRoute section={role === 'coach' ? 'coachhelm' : undefined} />;
}
