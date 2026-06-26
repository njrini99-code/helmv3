import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';

/**
 * Backward-compatible dispatcher for /baseball/dashboard bookmarks.
 *
 * Server-redirects immediately — the old client-only version could strand users
 * on an infinite PageLoading spinner when useAuth settled without matching
 * coach_type / user.role guards.
 */
export default async function DashboardRedirectPage() {
  const session = await getSessionProfile();

  // #region agent log
  console.error('[debug-ee78e2] /baseball/dashboard', JSON.stringify({
    hasSession: !!session,
    hasCoach: !!session?.coach,
    hasPlayer: !!session?.player,
    coachType: session?.coach?.coach_type ?? null,
    orgId: session?.coach?.organization_id ?? null,
  }));
  // #endregion

  if (!session) {
    redirect('/baseball/login');
  }

  if (session.coach) {
    redirect('/baseball/dashboard/command-center');
  }

  if (session.player) {
    redirect('/baseball/player/today');
  }

  redirect('/baseball/complete-signup');
}
