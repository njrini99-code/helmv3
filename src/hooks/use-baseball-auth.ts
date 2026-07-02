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

// ---------------------------------------------------------------------------
// Module-scope dedupe + short-lived cache, keyed by `requiredRole`.
//
// (dashboard)/layout.tsx's DashboardSessionGuard calls useBaseballAuth(null)
// to gate the team-context recovery redirect, then — only once that settles —
// mounts BaseballShellLayout, which calls useBaseballAuth(requiredRole) AGAIN
// to gate the shared shell chrome. Both calls run the full 4-round-trip
// verifyServerSession() (auth.getUser() + 3 parallel profile queries)
// independently, back-to-back (never concurrently, since the second mount is
// gated on the first settling) — so every hard navigation into the dashboard
// tree paid for that verification TWICE before any chrome could render.
// Visible as an extended "4-card skeleton, no chrome" (see Discover
// permanent-skeleton capture / repro).
//
// A short resolved-result cache collapses the two sequential mounts into ONE
// server round trip while preserving #416's intent ("always revalidate the
// server, never trust only client state"): the cache window is a few seconds
// — long enough to cover a same-navigation double-mount, short enough that
// every real navigation into the tree (fresh sign-in, hard reload, redirect
// after sign-out) still re-verifies against the server.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5000;
const CACHE_KEY = (requiredRole: Role | null) => requiredRole ?? '__any__';

const resultCache = new Map<string, { result: VerifyResult; resolvedAt: number }>();
const inflightByKey = new Map<string, Promise<VerifyResult>>();

function invalidateAuthCache() {
  resultCache.clear();
  inflightByKey.clear();
}

function verifyServerSession(
  supabase: ReturnType<typeof createClient>,
  requiredRole: Role | null,
): Promise<VerifyResult> {
  return (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return { ok: false, redirectTo: '/baseball/login' } as const;
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
        return { ok: false, redirectTo: '/baseball/complete-signup' } as const;
      }

      if (requiredRole && resolvedRole !== requiredRole) {
        return {
          ok: false,
          redirectTo: resolvedRole === 'coach'
            ? '/baseball/dashboard/command-center'
            : '/baseball/player/today',
        } as const;
      }

      if (resolvedRole === 'coach') {
        if (!coachProfile || !coachProfile.onboarding_completed) {
          return { ok: false, redirectTo: '/baseball/coach-onboarding' } as const;
        }
      } else if (resolvedRole === 'player') {
        if (!playerProfile || !playerProfile.onboarding_completed) {
          return { ok: false, redirectTo: '/baseball/player' } as const;
        }
      }

      return { ok: true, role: resolvedRole as Role, coachProfile, playerProfile } as const;
    } catch (error) {
      // Any unexpected throw (network blip, aborted fetch, SDK error) must
      // never strand `loading` at true forever — treat it the same as "could
      // not confirm you're signed in" and send to login instead of hanging on
      // the skeleton indefinitely. Mirrors the identical fix already applied
      // to useAuth() in use-auth.ts for the same class of bug.
      console.error('[useBaseballAuth] session verification failed:', error);
      return { ok: false, redirectTo: '/baseball/login' } as const;
    }
  })();
}

function resolveWithCache(
  supabase: ReturnType<typeof createClient>,
  requiredRole: Role | null,
): Promise<VerifyResult> {
  const key = CACHE_KEY(requiredRole);
  const now = Date.now();

  const cached = resultCache.get(key);
  if (cached && now - cached.resolvedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.result);
  }

  const existingInflight = inflightByKey.get(key);
  if (existingInflight) return existingInflight;

  const promise = verifyServerSession(supabase, requiredRole)
    .then((result) => {
      resultCache.set(key, { result, resolvedAt: Date.now() });
      return result;
    })
    .finally(() => {
      inflightByKey.delete(key);
    });

  inflightByKey.set(key, promise);
  return promise;
}

/**
 * Shared auth check for all baseball dashboard layouts.
 *
 * Always revalidates against the server before authorizing protected shell
 * content (#416). Cached Zustand state may hint at role but never gates access.
 *
 * De-dupes concurrent/back-to-back callers (same `requiredRole`) against a
 * short-lived module-scope cache so the same navigation never pays for the
 * 4-query session verification more than once — see cache doc block above.
 */
export function useBaseballAuth(requiredRole: Role | null = null): AuthResult {
  const router = useRouter();
  const supabaseRef = useRef(createClient());

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;

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
      try {
        const result = await resolveWithCache(supabaseRef.current, requiredRole);
        if (cancelled) return;

        if (!result.ok) {
          useAuthStore.getState().clear();
          invalidateAuthCache();
          router.push(result.redirectTo);
          return;
        }

        reconcileStore(result.coachProfile, result.playerProfile);
        setRole(result.role);
        setAuthorized(true);
      } finally {
        // ALWAYS resolve loading, even on an unexpected error above — a
        // stranded `true` here is exactly the eternal-skeleton bug this hook
        // exists to avoid.
        if (!cancelled) setLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [router, requiredRole]);

  return { loading, authorized, role };
}
