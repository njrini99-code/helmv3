import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { FeatureUnavailable } from '@/components/fairway';

export const metadata: Metadata = {
  title: 'Coaching Intelligence | GolfHelm',
  description: 'Configure your coaching philosophy, alert thresholds, and AI insight preferences.',
};

export default async function CoachingIntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Coach-only gate. The page is a client component and resolves coachId
  // asynchronously, so a non-coach (player or unlinked user) who deep-links
  // here would otherwise sit on an infinite skeleton. Mirror the coach-only
  // gate used on /dashboard/alerts: players get a FeatureUnavailable notice,
  // anyone without a session is sent to login.
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  if (!session.coach) {
    if (session.player) {
      return (
        <FeatureUnavailable
          title="Coaching Philosophy"
          message="Coaching Intelligence settings are part of the coach toolkit. Your personal AI surfaces live on the CoachHelm dashboard."
          actionHref="/golf/dashboard/coachhelm"
          actionLabel="Open CoachHelm"
        />
      );
    }
    redirect('/golf/login');
  }

  return children;
}
