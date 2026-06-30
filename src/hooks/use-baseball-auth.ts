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

type VerifyResult =
  | { ok: true; role: Role; coachProfile: BaseballProfile | null; playerProfile: BaseballProfile | null }
  | { ok: false; redirectTo: string };

/**
 * Shared auth check for all baseball dashboard layouts.
 *
 * Always revalidates against the server before authorizing protected shell
 * content (#416). Cached Zustand state may hint at role but never gates access.
 */
export function useBaseballAuth(requiredRole: Role | null = null): AuthResult {
  const router = useRouter();
  const supabaseRef = useRef(createClient());

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verifyServerSession(): Promise<VerifyResult | null> {
      const supabase = supabaseRef.current;
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return { ok: false, redirectTo: '/baseball/login' };
      }

      const [userResult, coachResult, playerResult] = await Promise.all([
        supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
        supabase.from('baseball_coaches').select('id, onboarding_completed, coach_type').eq('user_id', user.id).maybeSingle(),
        supabase.from('baseball_players').select('id, onboarding_completed, player_type').eq('user_id', user.id).maybeSingle(),
      ]);

      const userRole = userResult.data?.role;
      const coachProfile = coachResult.data as BaseballProfile | null;
      const playerProfile = playerResult.data as BaseballProfile | null;

      const declaredRole = (userRole === 'coach' || userRole === 'player') ? userRole : null;
      const resolvedRole = coachProfile && playerProfile
        ? (declaredRole || 'coach')
        : coachProfile
          ? 'coach'
          : playerProfile
            ? 'player'
            : declaredRole;

      if (!resolvedRole) {
        return { ok: false, redirectTo: '/baseball/complete-signup' };
      }

      if (requiredRole && resolvedRole !== requiredRole) {
        return {
          ok: false,
          redirectTo: resolvedRole === 'coach'
            ? '/baseball/dashboard/command-center'
            : '/baseball/player/today',
        };
      }

      if (resolvedRole === 'coach') {
        if (!coachProfile || !coachProfile.onboarding_completed) {
          return { ok: false, redirectTo: '/baseball/coach-onboarding' };
        }
      } else if (resolvedRole === 'player') {
        if (!playerProfile || !playerProfile.onboarding_completed) {
          return { ok: false, redirectTo: '/baseball/player' };
        }
      }

      return { ok: true, role: resolvedRole as Role, coachProfile, playerProfile };
    }

    function reconcileStore(
      coachProfile: BaseballProfile | null,
      playerProfile: BaseballProfile | null,
    ) {
      const store = useAuthStore.getState();
      const cachedCoachId = store.coach?.id ?? null;
      const cachedPlayerId = store.player?.id ?? null;
      const freshCoachId = coachProfile?.id ?? null;
      const freshPlayerId = playerProfile?.id ?? null;

      if (cachedCoachId !== freshCoachId || cachedPlayerId !== freshPlayerId) {
        store.clear();
      }

      if (coachProfile) {
        store.setCoach({
          ...(store.coach ?? {}),
          id: coachProfile.id,
          onboarding_completed: coachProfile.onboarding_completed,
          coach_type: coachProfile.coach_type,
        } as NonNullable<typeof store.coach>);
      } else {
        store.setCoach(null);
      }

      if (playerProfile) {
        store.setPlayer({
          ...(store.player ?? {}),
          id: playerProfile.id,
          onboarding_completed: playerProfile.onboarding_completed,
          player_type: playerProfile.player_type,
        } as NonNullable<typeof store.player>);
      } else {
        store.setPlayer(null);
      }
    }

    async function run() {
      setLoading(true);
      const result = await verifyServerSession();
      if (cancelled || !result) return;

      if (!result.ok) {
        useAuthStore.getState().clear();
        router.push(result.redirectTo);
        return;
      }

      reconcileStore(result.coachProfile, result.playerProfile);
      setRole(result.role);
      setAuthorized(true);
      setLoading(false);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [router, requiredRole]);

  return { loading, authorized, role };
}
