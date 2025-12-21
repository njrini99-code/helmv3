'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { User as AppUser, Coach, Player } from '@/lib/types';

interface AuthState {
  user: User | null;
  appUser: AppUser | null;
  coach: Coach | null;
  player: Player | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to get the current authenticated user and their associated data
 * This will automatically update when the user signs in or out
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    appUser: null,
    coach: null,
    player: null,
    loading: true,
    error: null,
  });

  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (session?.user) {
          await loadUserData(session.user);
        } else {
          setState({
            user: null,
            appUser: null,
            coach: null,
            player: null,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error as Error,
        }));
      }
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await loadUserData(session.user);
      } else {
        setState({
          user: null,
          appUser: null,
          coach: null,
          player: null,
          loading: false,
          error: null,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function loadUserData(user: User) {
    try {
      setState((prev) => ({ ...prev, loading: true }));

      // Get app user data
      const { data: appUser, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      // Get role-specific data
      let coach = null;
      let player = null;

      if (appUser.role === 'coach') {
        const { data: coachData, error: coachError } = await supabase
          .from('coaches')
          .select(`
            *,
            organization:organizations(*)
          `)
          .eq('user_id', user.id)
          .single();

        if (coachError && coachError.code !== 'PGRST116') {
          // PGRST116 = not found, which is ok during onboarding
          throw coachError;
        }

        coach = coachData;
      } else if (appUser.role === 'player') {
        const { data: playerData, error: playerError } = await supabase
          .from('players')
          .select(`
            *,
            high_school_org:organizations!players_high_school_org_id_fkey(*),
            showcase_org:organizations!players_showcase_org_id_fkey(*),
            college_org:organizations!players_college_org_id_fkey(*)
          `)
          .eq('user_id', user.id)
          .single();

        if (playerError && playerError.code !== 'PGRST116') {
          throw playerError;
        }

        player = playerData;
      }

      setState({
        user,
        appUser,
        coach,
        player,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error loading user data:', error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error as Error,
      }));
    }
  }

  return state;
}

/**
 * Hook to get just the current coach (throws if not a coach)
 */
export function useCoach() {
  const { coach, loading, error } = useAuth();

  return {
    coach,
    loading,
    error: error || (!loading && !coach ? new Error('Not authenticated as coach') : null),
  };
}

/**
 * Hook to get just the current player (throws if not a player)
 */
export function usePlayer() {
  const { player, loading, error } = useAuth();

  return {
    player,
    loading,
    error: error || (!loading && !player ? new Error('Not authenticated as player') : null),
  };
}

/**
 * Hook to sign out
 */
export function useSignOut() {
  const supabase = createClient();

  return async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.href = '/baseball/login';
  };
}
