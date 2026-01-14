'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import type { Player, Coach } from '@/lib/types';

export function useAuth() {
  const router = useRouter();
  const supabase = createClient();
  const isMounted = useRef(true);
  const { user, coach, player, loading, coachMode, setUser, setCoach, setPlayer, setLoading, setCoachMode, clear } = useAuthStore();

  const fetchUser = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!isMounted.current) return;

      if (!authUser) {
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single();

      if (!isMounted.current) return;

      if (userData) {
        setUser(userData);

        if (userData.role === 'coach') {
          const { data: coachData } = await supabase.from('baseball_coaches').select('*').eq('user_id', authUser.id).single();
          if (isMounted.current) setCoach(coachData);
        } else if (userData.role === 'player') {
          const { data: playerData } = await supabase.from('baseball_players').select('*').eq('user_id', authUser.id).single();
          if (isMounted.current) setPlayer(playerData);
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

  const updateCoach = async (updates: Partial<Coach>) => {
    if (!coach) return;
    const { data, error } = await supabase.from('baseball_coaches').update(updates).eq('id', coach.id).select().single();
    if (!error && data) setCoach(data);
    return { data, error };
  };

  return { user, coach, player, loading, coachMode, setCoachMode, signOut, updatePlayer, updateCoach };
}
