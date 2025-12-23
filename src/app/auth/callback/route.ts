import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/baseball/login';

  if (code) {
    const supabase = await createClient();
    
    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(new URL('/baseball/login?error=auth_failed', requestUrl.origin));
    }

    if (data.user) {
      // Check if user has a coach or player profile
      const { data: coach } = await supabase
        .from('coaches')
        .select('id, onboarding_completed')
        .eq('user_id', data.user.id)
        .single();

      const { data: player } = await supabase
        .from('players')
        .select('id, onboarding_completed')
        .eq('user_id', data.user.id)
        .single();

      // Determine redirect based on profile status
      if (coach) {
        if (!coach.onboarding_completed) {
          return NextResponse.redirect(new URL('/baseball/coach', requestUrl.origin));
        }
        return NextResponse.redirect(new URL('/baseball/dashboard', requestUrl.origin));
      }

      if (player) {
        if (!player.onboarding_completed) {
          return NextResponse.redirect(new URL('/baseball/player', requestUrl.origin));
        }
        return NextResponse.redirect(new URL('/baseball/dashboard', requestUrl.origin));
      }

      // No profile exists - redirect to complete signup
      // This handles OAuth users who need to create their profile
      return NextResponse.redirect(new URL('/baseball/complete-signup', requestUrl.origin));
    }
  }

  // No code - redirect to login
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
