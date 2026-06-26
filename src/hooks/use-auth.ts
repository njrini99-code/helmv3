'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import { useAuthStore } from '@/stores/auth-store';
import type { Player, CoachWithOrganization } from '@/lib/types';

// ---------------------------------------------------------------------------
// Module-level auth coordination.
//
// `loading`/`user`/`coach` live in a single shared zustand store, but EVERY
// component that calls useAuth() (the dashboard shell, the page body, the
// notification bell, the unread-count badge, …) used to independently run its
// own fetchUser() → setLoading(true), subscribe to onAuthStateChange, and
// re-run its effect whenever the router identity changed. With several
// instances racing on one global flag — and mount-guard early-returns that
// could skip setLoading(false) — the flag thrashed (visible flicker) and could
// get stranded `true` forever (pages stuck on the loading skeleton).
//
// The fix: one deduped fetch and one subscription, shared across all callers.
// `loading` only flips to the skeleton state on the genuine first load (when we
// have no user yet); background refreshes (token refresh, tab navigation) keep
// the current UI. `loading` is ALWAYS resolved in `finally`, independent of any
// component's mount state, so it can never strand.
// ---------------------------------------------------------------------------

let inFlight: Promise<void> | null = null;
let subscriberCount = 0;
let authSubscription: { unsubscribe: () => void } | null = null;
// Updated on every render so the single shared SIGNED_OUT handler can navigate
// with the freshest router instance without re-subscribing per render.
let latestRouter: ReturnType<typeof useRouter> | null = null;

type Client = ReturnType<typeof createClient>;

async function loadAuthUser(supabase: Client): Promise<void> {
  // Dedupe: concurrent callers share one in-flight fetch.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const store = useAuthStore.getState();
    // Only show the skeleton-loading state when we have nothing to render yet.
    // Background refreshes must NOT flip the UI back to a skeleton.
    if (!store.user) store.setLoading(true);

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        Sentry.setUser(null);
        return;
      }

      // Fetch user record and both profiles in parallel to avoid a waterfall.
      const [{ data: userData }, { data: coachData }, { data: playerData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).single(),
        supabase
          .from('baseball_coaches')
          .select('*, organization:organizations(id, name)')
          .eq('user_id', authUser.id)
          .maybeSingle(),
        supabase.from('baseball_players').select('*').eq('user_id', authUser.id).maybeSingle(),
      ]);

      const s = useAuthStore.getState();
      if (userData) {
        s.setUser(userData);
        if (coachData) s.setCoach(coachData);
        if (playerData) s.setPlayer(playerData);
        // Attribute Sentry events to this user. Email is intentionally NOT
        // sent — id + org_id + user_role tags give us all the triage signal
        // we need without shipping personal contact info to Sentry.
        const role = coachData ? 'coach' : playerData ? 'player' : 'user';
        Sentry.setUser({ id: authUser.id, segment: role });
        Sentry.setTag('user_role', role);
        if (coachData?.organization?.id) {
          Sentry.setTag('org_id', coachData.organization.id);
          Sentry.setTag('org_name', coachData.organization.name);
        }
      }
    } catch (error) {
      console.error('[useAuth] Error fetching user:', error);
    } finally {
      // ALWAYS resolve loading — this is a global flag, never gated on the mount
      // state of whichever component happened to kick off the fetch.
      useAuthStore.getState().setLoading(false);
      inFlight = null;
    }
  })();

  return inFlight;
}

export function useAuth() {
  const router = useRouter();
  latestRouter = router;

  // useRef prevents createClient() from being called on every render.
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const {
    user,
    coach,
    player,
    loading,
    coachMode,
    setPlayer,
    setCoach,
    setCoachMode,
    clear,
  } = useAuthStore();

  useEffect(() => {
    subscriberCount += 1;
    // Kick off (or join) the shared auth fetch.
    loadAuthUser(supabase);

    // Exactly ONE auth-state subscription across all hook instances.
    if (!authSubscription) {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          Sentry.setUser(null);
          Sentry.getCurrentScope().setTags({
            user_role: undefined,
            org_id: undefined,
            org_name: undefined,
          });
          useAuthStore.getState().clear();
          latestRouter?.push('/baseball/login');
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          loadAuthUser(supabase);
        }
      });
      authSubscription = data.subscription;
    }

    return () => {
      subscriberCount -= 1;
      // Tear the shared subscription down only when the last consumer unmounts.
      if (subscriberCount <= 0 && authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
        subscriberCount = 0;
      }
    };
    // supabase is a stable ref; intentionally not depending on router/clear so
    // the subscription is not torn down + rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    clear();
    if (typeof document !== 'undefined') {
      document.cookie = 'coach_mode=; Path=/; Max-Age=0; SameSite=Lax';
    }
    router.push('/baseball/login');
  };

  const updatePlayer = async (updates: Partial<Player>) => {
    if (!player) return;
    const { data, error } = await supabase
      .from('baseball_players')
      .update(updates)
      .eq('id', player.id)
      .select()
      .single();
    if (!error && data) setPlayer(data);
    return { data, error };
  };

  const updateCoach = async (updates: Partial<CoachWithOrganization>) => {
    if (!coach) return;
    const { data, error } = await fromUntyped(supabase, 'baseball_coaches')
      .update(updates)
      .eq('id', coach.id)
      .select()
      .single();
    if (!error && data) setCoach(data);
    return { data, error };
  };

  return { user, coach, player, loading, coachMode, setCoachMode, signOut, updatePlayer, updateCoach };
}
