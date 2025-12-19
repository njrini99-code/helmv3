'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import type { Player, Coach } from '@/types/database';

export function useAuth() {
  const router = useRouter();
  const supabase = createClient();
  const { user, coach, player, loading, isDevMode, setUser, setCoach, setPlayer, setLoading, clear } = useAuthStore();

  useEffect(() => {
    const fetchUser = async () => {
      // If dev mode is active and user is already set, don't fetch from Supabase
      if (isDevMode && user) {
        setLoading(false);
        return;
      }

      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single();

      if (userData) {
        setUser(userData);

        if (userData.role === 'coach') {
          const { data: coachData } = await supabase.from('coaches').select('*').eq('user_id', authUser.id).single();
          setCoach(coachData);
        } else if (userData.role === 'player') {
          const { data: playerData } = await supabase.from('players').select('*').eq('user_id', authUser.id).single();
          setPlayer(playerData);
        }
      }

      setLoading(false);
    };

    fetchUser();

    // Don't set up auth state listener in dev mode
    if (!isDevMode) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_OUT') {
          clear();
          router.push('/login');
        } else if (event === 'SIGNED_IN') {
          fetchUser();
        }
      });

      return () => subscription.unsubscribe();
    }
  }, [isDevMode]);

  const signOut = async () => {
    await supabase.auth.signOut();
    clear();
    router.push('/login');
  };

  const updatePlayer = async (updates: Partial<Player>) => {
    if (!player) return;
    const { data, error } = await supabase.from('players').update(updates).eq('id', player.id).select().single();
    if (!error && data) setPlayer(data);
    return { data, error };
  };

  const updateCoach = async (updates: Partial<Coach>) => {
    if (!coach) return;
    const { data, error } = await supabase.from('coaches').update(updates).eq('id', coach.id).select().single();
    if (!error && data) setCoach(data);
    return { data, error };
  };

  return { user, coach, player, loading, signOut, updatePlayer, updateCoach };
}
