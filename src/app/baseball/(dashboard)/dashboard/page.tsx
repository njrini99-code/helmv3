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
