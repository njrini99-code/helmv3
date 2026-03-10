'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface TeamContext {
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

      // 2. PARALLELIZED: Check coach AND player simultaneously
      // Coach gets team via organization_id -> golf_teams
      // Player gets team via golf_team_members
      const [coachResult, playerResult] = await Promise.all([
        supabase
          .from('golf_coaches')
          .select('id, organization_id, full_name')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('golf_players')
          .select('id, first_name, last_name')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      const coach = coachResult.data;
      const player = playerResult.data;

      if (coach) {
        // User is a coach - get team via organization_id
        let teamId: string | null = null;
        let teamName: string | null = null;

        if (coach.organization_id) {
          const { data: team } = await supabase
            .from('golf_teams')
            .select('id, name')
            .eq('organization_id', coach.organization_id)
            .maybeSingle();
          teamId = team?.id ?? null;
          teamName = team?.name ?? null;
        }

        setContext({
          userId: user.id,
          userRole: 'coach',
          coachId: coach.id,
          playerId: null,
          teamId,
          teamName,
        });
        setLoading(false);
        return;
      }

      if (player) {
        // User is a player - get team via golf_team_members
        let teamId: string | null = null;
        let teamName: string | null = null;

        const { data: membership } = await supabase
          .from('golf_team_members')
          .select('team_id, team:golf_teams(name)')
          .eq('player_id', player.id)
          .eq('status', 'active')
          .maybeSingle();

        if (membership) {
          teamId = membership.team_id;
          const teamData = membership.team as { name: string } | null;
          teamName = teamData?.name ?? null;
        }

        setContext({
          userId: user.id,
          userRole: 'player',
          coachId: null,
          playerId: player.id,
          teamId,
          teamName,
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
