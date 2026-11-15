import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { ClubhouseCoachHelmRoute } from '@/clubhouse/routes/coachhelm';

export const metadata: Metadata = {
  title: 'CoachHelm',
  description: 'AI-powered insights, predictions, and focus areas for your golf performance.',
};

export default async function CoachHelmPage({ searchParams }: { searchParams: Promise<{ view?: string; player?: string; c?: string; section?: string; open?: string; insight?: string; at?: string; from?: string }> }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  // Clubhouse CoachHelm: one page for coaches and players, drawn in place (no redirect: see golf-conditional-redirect.test.ts).
  return <ClubhouseCoachHelmRoute {...(await searchParams)} />;
}
