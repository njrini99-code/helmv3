'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface TeamContext {
  // User identity
  userId: string | null;
  userRole: 'coach' | 'player' | null;

  // Role-specific IDs
  coachId: string | null;
  playerId: string | null;

  // Team info
  teamId: string | null;
  teamName: string | null;

  // Loading/error state
  loading: boolean;
  error: string | null;

  // Refresh function
  refresh: () => Promise<void>;
}

export function useTeamContext(): TeamContext {
  const [context, setContext] = useState<Omit<TeamContext, 'refresh' | 'loading' | 'error'>>({
    userId: null,
    userRole: null,
    coachId: null,
    playerId: null,
    teamId: null,
    teamName: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // 1. Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // 2. PARALLELIZED: Check coach AND player simultaneously with team joins
      // Previously: 2-4 sequential queries depending on role
      // Now: 2 parallel queries with JOINs (eliminates extra team fetch)
      const [coachResult, playerResult] = await Promise.all([
        supabase
          .from('golf_coaches')
          .select('id, team_id, full_name, team:golf_teams(name)')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('golf_players')
          .select('id, team_id, first_name, last_name, team:golf_teams(name)')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      const coach = coachResult.data;
      const player = playerResult.data;

      if (coach) {
        // User is a coach - team name comes from JOIN
        const teamData = coach.team as { name: string } | null;
        setContext({
          userId: user.id,
          userRole: 'coach',
          coachId: coach.id,
          playerId: null,
          teamId: coach.team_id,
          teamName: teamData?.name || null,
        });
        setLoading(false);
        return;
      }

      if (player) {
        // User is a player - team name comes from JOIN
        const teamData = player.team as { name: string } | null;
        setContext({
          userId: user.id,
          userRole: 'player',
          coachId: null,
          playerId: player.id,
          teamId: player.team_id,
          teamName: teamData?.name || null,
        });
        setLoading(false);
        return;
      }

      // 3. User has no profile yet
      setContext({
        userId: user.id,
        userRole: null,
        coachId: null,
        playerId: null,
        teamId: null,
        teamName: null,
      });
      setError('No player or coach profile found');

    } catch (err) {
      console.error('Error fetching team context:', err);
      setError('Failed to load team context');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  return {
    ...context,
    loading,
    error,
    refresh: fetchContext,
  };
}
