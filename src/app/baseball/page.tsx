import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';

/**
 * BaseballHelm landing route.
 *
 * The bare `/baseball` path had no page (returned 404). Mirror the GolfHelm
 * landing pattern: unauthenticated visitors go to the login, authenticated
 * users go to the dashboard (which role-routes coach vs player internally).
 */
export default async function BaseballLandingPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect('/baseball/login');
  }

  redirect(session.coach ? '/baseball/dashboard/command-center' : '/baseball/player/today');
}
