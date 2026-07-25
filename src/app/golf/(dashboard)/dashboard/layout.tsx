import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { CoachHelmDrawer } from '@/components/golf/coachhelm/chat/CoachHelmDrawer';
import { resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { getProgramPulse, suggestionsFromPulse } from '@/lib/coachhelm/v3/chat/program-pulse';
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

  // Roster + suggestions for the drawer, resolved once for the whole dashboard.
  // Degrades to no drawer rather than an error: CoachHelm being unavailable
  // must never take the calendar or the roster down with it.
  let drawer: { players: { id: string; name: string }[]; suggestions: string[]; teamName: string } | null =
    null;
  if (isCoach) {
    try {
      const sb = await createClient();
      const ctx = await resolveCoachChatContext(sb);
      const pulse = await getProgramPulse(sb, ctx).catch(() => null);
      drawer = {
        players: ctx.roster.map((p) => ({ id: p.id, name: p.name })),
        suggestions: pulse ? suggestionsFromPulse(pulse, ctx.team_name) : [],
        teamName: ctx.team_name,
      };
    } catch {
      drawer = null;
    }
  }

  return (
    <>
      {/* v3 design language: Lenis-powered smooth scroll (continuity of
          perception). The hook gates itself on coarse-pointer + reduced
          motion, so mobile + accessibility-first users keep native
          inertia; only desktop pointer users get the inertial sweep. */}
      <SmoothScrollMount />
      {children}
      {/* The global CoachHelm drawer — coach-only, and the same shared chat
          system the full Ask page runs on. */}
      {drawer && (
        <CoachHelmDrawer
          players={drawer.players}
          suggestions={drawer.suggestions}
          teamName={drawer.teamName}
        />
      )}
    </>
  );
}
