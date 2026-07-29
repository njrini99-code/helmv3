import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { CoachHelmDrawer } from '@/components/golf/coachhelm/chat/CoachHelmDrawer';
import { suggestionsFromPulse } from '@/lib/coachhelm/v3/chat/program-pulse';
import { getCoachChatContext, getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { SmoothScrollMount } from '@/components/golf/layout/SmoothScrollMount';

export const metadata: Metadata = {
  title: 'Dashboard | GolfHelm',
  description: 'Your golf team dashboard — performance tracking, team management, and coaching tools.',
};

/**
 * The floating CoachHelm launcher's data, isolated behind its own Suspense
 * boundary.
 *
 * This used to be awaited in the layout BODY, directly in front of
 * `{children}`. That is roughly a dozen round trips — six serial ones to
 * resolve the chat context, then the program pulse's own query wave (including
 * a `golf_rounds` read capped at 400 rows) — and a layout cannot return until
 * its own awaits finish, so the real dashboard could not render behind them. It
 * ran on every `/golf/dashboard/*` navigation, not only the one after sign-in.
 *
 * None of it is first-paint content: `CoachHelmDrawer` mounts CLOSED
 * (`useState(false)`), so this is the data behind a button nobody has pressed
 * yet. Streaming it in its own boundary lets the dashboard paint on its own
 * schedule; the launcher appears whenever its data lands.
 *
 * `fallback={null}` because there is nothing honest to placehold. The drawer is
 * a floating affordance in the corner, not a reserved region of the page, so a
 * skeleton for it would reserve a shape that never settles anywhere.
 */
async function CoachHelmDrawerMount() {
  // Degrades to no drawer rather than an error: CoachHelm being unavailable
  // must never take the calendar or the roster down with it.
  try {
    const ctx = await getCoachChatContext();
    const pulse = await getCoachProgramPulse();
    return (
      <CoachHelmDrawer
        players={ctx.roster.map((p) => ({ id: p.id, name: p.name }))}
        suggestions={pulse ? suggestionsFromPulse(pulse, ctx.team_name) : []}
        teamName={ctx.team_name}
      />
    );
  } catch {
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The ONLY await left in this layout, and it is free: `getGolfSessionProfile`
  // is React.cache()-wrapped and the parent `(dashboard)/layout.tsx` has
  // already called it this request, so this is a cache hit, not a query.
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
      {/* The global CoachHelm drawer — coach-only, and the same shared chat
          system the full Ask page runs on. Streamed; see the note above. */}
      {isCoach && (
        <Suspense fallback={null}>
          <CoachHelmDrawerMount />
        </Suspense>
      )}
    </>
  );
}
