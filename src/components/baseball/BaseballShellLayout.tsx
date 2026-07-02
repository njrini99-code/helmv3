'use client';

// =============================================================================
// BaseballShellLayout — shared layout wrapper for all three BaseballHelm shell
// route groups: (dashboard), (coach-dashboard)/coach, (player-dashboard)/player.
//
// Extracted so the three layout.tsx files stay a thin ≤15-line wrapper around
// this component instead of triplicating the same provider tree. Any change to
// the session / provider / shell composition is made here once; the three layouts
// pick it up automatically.
//
// The only difference between the three layout variants is auth-role enforcement:
//   - (dashboard):        useBaseballAuth() — accepts both roles, passes dynamic
//   - (coach-dashboard):  useBaseballAuth('coach') — rejects players
//   - (player-dashboard): useBaseballAuth('player') — rejects coaches
//
// The `requiredRole` prop maps to those three cases so callers can share this
// component without adding their own provider trees.
// =============================================================================

import type { ReactNode } from 'react';
import { SidebarProvider } from '@/contexts/sidebar-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { PageLoading } from '@/components/ui/loading';
import { LastSeenUpdater } from '@/components/admin/LastSeenUpdater';
import { PeekPanelProvider } from '@/components/baseball/peek-panel';
import { BaseballDashboardShell } from '@/components/baseball/dashboard-shell';
import { BaseballProgramBrand } from '@/components/baseball/settings/BaseballProgramBrand';
import { useBaseballAuth } from '@/hooks/use-baseball-auth';
import { useBaseballNavContext } from '@/hooks/use-baseball-nav-context';
import type { ActiveBaseballRole } from '@/lib/baseball/active-context-shared';

interface BaseballShellLayoutProps {
  children: ReactNode;
  /**
   * When set, the auth hook enforces that the signed-in user has the matching
   * role and redirects otherwise. `null` accepts both coach and player (the
   * generic /baseball/dashboard route group). The `role` passed to the shell is
   * derived from the auth response when this is `null`.
   */
  requiredRole: ActiveBaseballRole | null;
}

export function BaseballShellLayout({
  children,
  requiredRole,
}: BaseballShellLayoutProps) {
  // For the generic (dashboard) group, `requiredRole` is null and the hook
  // accepts both roles + returns the real role from the session. For the
  // role-locked groups it enforces the expected role and redirects on mismatch.
  const { loading, authorized, role } = useBaseballAuth(requiredRole);
  // Server-resolved capability map so capability-gated coach verticals (Import
  // Center, Postgame Review, Practice Effectiveness, Decision Room, Staff/Program
  // Settings) actually appear in the nav. Without this the shell falls back to an
  // empty capability map and fail-closes every gated entry.
  const { navContext } = useBaseballNavContext();

  if (loading || !authorized) {
    return <PageLoading />;
  }

  // When a role is locked (coach / player layout) pass it directly so the shell
  // does not have to re-derive it from the session. When null, use the value the
  // auth hook resolved (never undefined at this point because we checked above).
  const resolvedRole: 'coach' | 'player' =
    requiredRole ?? role ?? 'coach';

  return (
    <SidebarProvider>
      <SessionActivityProvider>
        <LastSeenUpdater />
        {/* Render-null: fetches the program's brand + applies it as CSS vars /
            data attrs on <html>. Mounted once per shell so persisted branding
            (settings/appearance) actually takes visible effect. */}
        <BaseballProgramBrand />
        <PeekPanelProvider>
          <BaseballDashboardShell role={resolvedRole} navContext={navContext ?? undefined}>
            {children}
          </BaseballDashboardShell>
        </PeekPanelProvider>
      </SessionActivityProvider>
    </SidebarProvider>
  );
}
