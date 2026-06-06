'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import { useAuthStore } from '@/stores/auth-store';
import type { Player, CoachWithOrganization } from '@/lib/types';

export function useAuth() {
  const router = useRouter();
  // useRef prevents createClient() from being called on every render.
  // Without this, supabase is a new object each render → fetchUser useCallback
  // recreates each render → onAuthStateChange resubscribes each render → flicker/loop.
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const isMounted = useRef(true);
  const { user, coach, player, loading, coachMode, setUser, setCoach, setPlayer, setLoading, setCoachMode, clear } = useAuthStore();

  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!isMounted.current) return;

      if (!authUser) {
        Sentry.setUser(null);
        setLoading(false);
        return;
      }

      // Fetch user record and both profiles in parallel to avoid waterfall
      const [{ data: userData }, { data: coachData }, { data: playerData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).single(),
        supabase.from('baseball_coaches').select('*, organization:organizations(id, name)').eq('user_id', authUser.id).maybeSingle(),
        supabase.from('baseball_players').select('*').eq('user_id', authUser.id).maybeSingle(),
      ]);

      if (!isMounted.current) return;

      if (userData) {
        setUser(userData);
        if (coachData) setCoach(coachData);
        if (playerData) setPlayer(playerData);
        // Attribute Sentry events to this user. Email is intentionally NOT
        // sent — id + org_id + user_role tags below give us all the triage
        // signal we need without shipping personal contact info to Sentry.
        const role = coachData ? 'coach' : playerData ? 'player' : 'user';
        Sentry.setUser({
          id: authUser.id,
          segment: role,
        });
        // Tags make triage 10x faster — "filter to coach errors in org X"
        // is a one-click query in the Sentry UI.
        Sentry.setTag('user_role', role);
        if (coachData?.organization?.id) {
          Sentry.setTag('org_id', coachData.organization.id);
          Sentry.setTag('org_name', coachData.organization.name);
        }
      }

      if (isMounted.current) setLoading(false);
    } catch (error) {
      console.error('[useAuth] Error fetching user:', error);
      if (isMounted.current) setLoading(false);
    }
  }, [supabase, setUser, setCoach, setPlayer, setLoading]);

  useEffect(() => {
    isMounted.current = true;
    fetchUser();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (!isMounted.current) return;

      if (event === 'SIGNED_OUT') {
        Sentry.setUser(null);
        Sentry.getCurrentScope().setTags({
          user_role: undefined,
          org_id: undefined,
          org_name: undefined,
        });
        clear();
        router.push('/baseball/login');
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        fetchUser();
      }
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, [fetchUser, supabase, clear, router]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const maxAgeDays = 30;
    const maxAgeSeconds = maxAgeDays * 24 * 60 * 60;
    document.cookie = `coach_mode=${encodeURIComponent(
      coachMode
    )}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
  }, [coachMode]);

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
    const { data, error } = await supabase.from('baseball_players').update(updates).eq('id', player.id).select().single();
    if (!error && data) setPlayer(data);
    return { data, error };
  };

  const updateCoach = async (updates: Partial<CoachWithOrganization>) => {
    if (!coach) return;
    const { data, error } = await fromUntyped(supabase, 'baseball_coaches').update(updates).eq('id', coach.id).select().single();
    if (!error && data) setCoach(data);
    return { data, error };
  };

  return { user, coach, player, loading, coachMode, setCoachMode, signOut, updatePlayer, updateCoach };
}
