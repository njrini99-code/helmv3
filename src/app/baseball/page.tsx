import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * BaseballHelm landing route.
 *
 * The bare `/baseball` path had no page (returned 404). Mirror the GolfHelm
 * landing pattern: unauthenticated visitors go to the login, authenticated
 * users go to the dashboard (which role-routes coach vs player internally).
 */
export default async function BaseballLandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/baseball/login');
  }

  redirect('/baseball/dashboard');
}
