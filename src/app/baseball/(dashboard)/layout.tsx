'use client';

// =============================================================================
// src/app/baseball/(dashboard)/layout.tsx
//
// W6 PROTECTION — team-context guard for the generic (dashboard) route group.
//
// This layout accepts BOTH roles (coach AND player) with requiredRole=null.
// BaseballShellLayout handles:
//   - Auth enforcement (useBaseballAuth): unauthenticated → /baseball/login,
//     no profile → /baseball/complete-signup, onboarding incomplete → onboarding.
//
// THIS layout adds the TEAM-CONTEXT GUARD on top:
//   - "missing-team": user is fully authed + onboarded but belongs to NO baseball
//     team (getActiveBaseballContext returns null, so navContext stays null).
//     Without this guard, a teamless-but-authed user would render the shell with
//     no active team → every server action / data fetch silently returns empty /
//     fails RLS. Instead we route them to the right recovery surface:
//       · Player → /baseball/player/today  (PlayerTodayTeamless inline join flow)
//       · Coach  → /baseball/coach-onboarding (create a program)
//   - "wrong-sport" (GolfHelm-only user navigates to /baseball/dashboard):
//     Already caught by useBaseballAuth which redirects to /baseball/login when
//     no baseball_coaches / baseball_players row exists. This guard is therefore
//     defense-in-depth for the rare case where a user has both golf and baseball
//     profiles but no active baseball team.
//
// SECURITY NOTE: this is a UX guard, NOT an access-control boundary. Every route
// inside this layout group is independently protected server-side via
// withBaseballAction + requireBaseballCapability + RLS. The guard only prevents
// the awkward "dashboard but nothing loads" experience for new users.
//
// Coach-type and program-type route policy now belongs to server page guards
// (see src/lib/baseball/server-route-guards.ts). The layout guard covers TEAM
// PRESENCE, not coach_type.
// =============================================================================

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BaseballShellLayout } from '@/components/baseball/BaseballShellLayout';
import { BaseballFairwayShell } from './BaseballFairwayShell';
import { PageLoading } from '@/components/ui/loading';
import { useBaseballAuth } from '@/hooks/use-baseball-auth';
import { useBaseballNavContext } from '@/hooks/use-baseball-nav-context';
import { isRedesignEnabled } from '@/lib/redesign/flag';

// ---------------------------------------------------------------------------
// Inner guard — rendered after BaseballShellLayout's auth gate has passed.
// Placed as a sibling wrapper so the hooks run in a client component boundary
// that is ABOVE the shell (layout route groups wrap all children).
//
// Strategy: call the same two hooks that BaseballShellLayout uses internally.
// Both are safe to call twice:
//   - useBaseballAuth: verifies session; fast-path from Zustand persisted store.
//   - useBaseballNavContext: module-scope cache → no extra network call when
//     BaseballShellLayout calls it again synchronously after this component.
// ---------------------------------------------------------------------------
function DashboardSessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loading: authLoading, authorized, role } = useBaseballAuth(null);
  const { navContext, loading: navLoading } = useBaseballNavContext();

  // Guard fires only when BOTH auth and nav-context are fully settled.
  // While either is still loading, show the page skeleton so there is no flash.
  const bothSettled = !authLoading && !navLoading;

  useEffect(() => {
    // Don't redirect while still loading or if auth failed (useBaseballAuth
    // already handles the auth failure redirect itself).
    if (!bothSettled) return;
    if (!authorized) return;

    // Both settled + authorized + navContext is null → user is authenticated
    // and onboarded but has NO active baseball team membership.
    // Route them to the appropriate recovery surface.
    if (navContext === null) {
      if (role === 'player') {
        // PlayerTodayTeamless shows an inline join-by-code flow.
        // Navigating there instead of redirecting avoids re-entering this guard.
        router.replace('/baseball/player/today');
      } else {
        // Coach with no team → create a program.
        router.replace('/baseball/coach-onboarding');
      }
    }
  }, [bothSettled, authorized, navContext, role, router]);

  // Show page skeleton while loading OR while a redirect is pending
  // (navContext null + authorized + settled → redirect in-flight).
  if (!bothSettled || (authorized && navContext === null)) {
    return <PageLoading />;
  }

  const shell = isRedesignEnabled() ? (
    <BaseballFairwayShell authVerified>{children}</BaseballFairwayShell>
  ) : (
    <BaseballShellLayout requiredRole={null}>{children}</BaseballShellLayout>
  );

  return shell;
}

// ---------------------------------------------------------------------------
// Layout export — thin shell that composes the session guard around the shared
// BaseballShellLayout. Both components are client components; the guard runs
// its hooks before the shell renders, so the shell always receives a non-null
// navContext (or the user has already been redirected away).
//
// FAIRWAY MIGRATION — PHASE A (shell only): the team-context guard above is
// shared verbatim by both branches below — it is not part of "the shell" and
// stays byte-for-byte unchanged regardless of the flag. Only what renders
// INSIDE the guard is gated: flag ON mounts BaseballFairwayShell (the Fairway
// AppShell frame, presentation-only); flag OFF keeps the existing
// BaseballShellLayout -> BaseballDashboardShell composition exactly as it
// shipped before this change. Default (flag unset) is OFF — dark and
// reversible.
// ---------------------------------------------------------------------------
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardSessionGuard>{children}</DashboardSessionGuard>;
}
