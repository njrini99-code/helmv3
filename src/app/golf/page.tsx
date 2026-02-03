import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Golf Landing Page
 *
 * Handles routing based on authentication and profile status:
 * - Not authenticated: Redirect to /golf/login
 * - Authenticated with golf coach profile: Redirect to /golf/dashboard
 * - Authenticated with golf player profile: Redirect to /golf/dashboard
 * - Authenticated without golf profile: Redirect to /golf/signup (to choose role)
 */
export default async function GolfLandingPage() {
  const supabase = await createClient();

  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Not authenticated - redirect to login
    redirect('/golf/login');
  }

  // Check if user has a golf coach profile
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coach) {
    // User is a golf coach - redirect to dashboard
    redirect('/golf/dashboard');
  }

  // Check if user has a golf player profile
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (player) {
    // User is a golf player - redirect to dashboard
    redirect('/golf/dashboard');
  }

  // User is authenticated but doesn't have a golf profile
  // Redirect to signup to choose their role and complete onboarding
  redirect('/golf/signup');
}
