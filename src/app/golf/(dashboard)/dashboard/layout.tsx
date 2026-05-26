import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { ChatDrawer } from '@/components/golf/coachhelm/v3/Chat/ChatDrawer';
import { SmoothScrollMount } from '@/components/golf/layout/SmoothScrollMount';

export const metadata: Metadata = {
  title: 'Dashboard | GolfHelm',
  description: 'Your golf team dashboard — performance tracking, team management, and coaching tools.',
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getGolfSessionProfile();
  const isCoach = !!session?.coach;
  return (
    <>
      {/* v3 design language: Lenis-powered smooth scroll (continuity of
          perception). The hook gates itself on coarse-pointer + reduced
          motion, so mobile + accessibility-first users keep native
          inertia; only desktop pointer users get the inertial sweep. */}
      <SmoothScrollMount />
      {children}
      {/* W32: persistent CoachHelm chat launcher — coach-only per
          master plan Part XII.5 (player chat deferred). */}
      {isCoach && <ChatDrawer />}
    </>
  );
}
