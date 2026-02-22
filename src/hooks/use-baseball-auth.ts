'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Role = 'coach' | 'player';

type BaseballProfile = {
  id: string;
  onboarding_completed: boolean;
  coach_type?: string;
  player_type?: string;
};

type AuthResult = {
  loading: boolean;
  authorized: boolean;
  role: Role | null;
};

/**
 * Shared auth check for all baseball dashboard layouts.
 * Single getUser() + parallel profile queries — eliminates redundant auth checks.
 *
 * @param requiredRole - If set, only authorizes users with this specific role.
 *                       If null, authorizes any authenticated user with a completed profile.
 */
export function useBaseballAuth(requiredRole: Role | null = null): AuthResult {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const supabase = supabaseRef.current;
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/baseball/login');
        return;
      }

      // Single parallel fetch for user record + both profiles
      const [userResult, coachResult, playerResult] = await Promise.all([
        supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
        supabase.from('baseball_coaches').select('id, onboarding_completed, coach_type').eq('user_id', user.id).maybeSingle(),
        supabase.from('baseball_players').select('id, onboarding_completed, player_type').eq('user_id', user.id).maybeSingle(),
      ]);

      const userRole = userResult.data?.role;
      const coachProfile = coachResult.data as BaseballProfile | null;
      const playerProfile = playerResult.data as BaseballProfile | null;

      // Resolve role from profiles (profile presence is source of truth)
      const declaredRole = (userRole === 'coach' || userRole === 'player') ? userRole : null;
      const resolvedRole = coachProfile && playerProfile
        ? (declaredRole || 'coach')
        : coachProfile
          ? 'coach'
          : playerProfile
            ? 'player'
            : declaredRole;

      // No role at all — send to complete-signup
      if (!resolvedRole) {
        router.push('/baseball/complete-signup');
        return;
      }

      // If a specific role is required, check it matches
      if (requiredRole && resolvedRole !== requiredRole) {
        router.push('/baseball/dashboard');
        return;
      }

      // Check onboarding completion
      if (resolvedRole === 'coach') {
        if (!coachProfile || !coachProfile.onboarding_completed) {
          router.push('/baseball/coach-onboarding');
          return;
        }
      } else if (resolvedRole === 'player') {
        if (!playerProfile || !playerProfile.onboarding_completed) {
          router.push('/baseball/player');
          return;
        }
      }

      setRole(resolvedRole);
      setAuthorized(true);
      setLoading(false);
    }

    checkAuth();
  }, [router, requiredRole]);

  return { loading, authorized, role };
}
