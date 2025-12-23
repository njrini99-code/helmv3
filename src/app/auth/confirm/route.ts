import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const next = requestUrl.searchParams.get('next') ?? '/';

  if (token_hash && type) {
    const supabase = await createClient();

    // Exchange token for session
    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    });

    if (!error) {
      // Get user to determine role and redirect
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Get user's role from users table
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        // Redirect based on role
        if (userData?.role === 'coach') {
          // Check if baseball or golf coach
          const { data: baseballCoach } = await supabase
            .from('coaches')
            .select('id')
            .eq('user_id', user.id)
            .single();

          if (baseballCoach) {
            return NextResponse.redirect(new URL('/baseball/dashboard', request.url));
          }

          const { data: golfCoach } = await supabase
            .from('golf_coaches')
            .select('id')
            .eq('user_id', user.id)
            .single();

          if (golfCoach) {
            return NextResponse.redirect(new URL('/golf/dashboard', request.url));
          }
        } else if (userData?.role === 'player') {
          // Check if baseball or golf player
          const { data: baseballPlayer } = await supabase
            .from('players')
            .select('id')
            .eq('user_id', user.id)
            .single();

          if (baseballPlayer) {
            return NextResponse.redirect(new URL('/baseball/dashboard', request.url));
          }

          const { data: golfPlayer } = await supabase
            .from('golf_players')
            .select('id')
            .eq('user_id', user.id)
            .single();

          if (golfPlayer) {
            return NextResponse.redirect(new URL('/golf/dashboard', request.url));
          }
        }
      }

      // Default redirect if role detection fails
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Redirect to error page if token verification fails
  return NextResponse.redirect(new URL('/auth/auth-code-error', request.url));
}
