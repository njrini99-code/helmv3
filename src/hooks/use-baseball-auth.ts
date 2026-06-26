'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

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
 *
 * Fast-path: reads Zustand auth store (persisted to localStorage) for instant
 * auth on repeat visits — no Supabase round-trip needed, no layout flash.
 * Background verification still confirms session validity.
 *
 * Full check: only runs on first visit (empty store) or on session expiry.
 */
export function useBaseballAuth(requiredRole: Role | null = null): AuthResult {
  const router = useRouter();
  const supabaseRef = useRef(createClient());

  // Read current store state imperatively — safe at render time since Zustand
  // persist rehydrates synchronously from localStorage before first render.
  const { user: storeUser, coach: storeCoach, player: storePlayer } = useAuthStore.getState();

  // Derive initial auth state from persisted store data (runs once at mount)
  const getInitialFromStore = (): { authorized: boolean; role: Role | null } => {
    if (!storeUser) return { authorized: false, role: null };

    const resolvedRole: Role | null = storeCoach
      ? 'coach'
      : storePlayer
        ? 'player'
        : (storeUser.role === 'coach' || storeUser.role === 'player')
          ? (storeUser.role as Role)
          : null;

    if (!resolvedRole) return { authorized: false, role: null };
    if (requiredRole && resolvedRole !== requiredRole) return { authorized: false, role: null };

    if (resolvedRole === 'coach' && (!storeCoach || !storeCoach.onboarding_completed)) {
      return { authorized: false, role: null };
    }
    if (resolvedRole === 'player' && (!storePlayer || !(storePlayer as { onboarding_completed?: boolean }).onboarding_completed)) {
      return { authorized: false, role: null };
    }

    return { authorized: true, role: resolvedRole };
  };

  const initial = getInitialFromStore();

  const [loading, setLoading] = useState(!initial.authorized);
  const [authorized, setAuthorized] = useState(initial.authorized);
  const [role, setRole] = useState<Role | null>(initial.role);

  useEffect(() => {
    // Fast-path: store had valid auth — verify session in background (non-blocking)
    if (initial.authorized) {
      void supabaseRef.current.auth.getUser().then(({ data: { user } }) => {
        if (!user) {
          // Session expired — clear store and redirect
          useAuthStore.getState().clear();
          router.push('/baseball/login');
        }
      });
      return;
    }

    // Full check: store was empty or invalid — do Supabase round-trip
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
        router.push(resolvedRole === 'coach' ? '/baseball/dashboard/command-center' : '/baseball/player/today');
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

      setRole(resolvedRole as Role);
      setAuthorized(true);
      setLoading(false);
    }

    checkAuth();
  }, [router, requiredRole]); // eslint-disable-line react-hooks/exhaustive-deps

  return { loading, authorized, role };
}
