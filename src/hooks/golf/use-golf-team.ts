'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { GolfTeam, GolfPlayer, GolfCoach } from '@/lib/types/golf';

interface UseGolfTeamResult {
  team: GolfTeam | null;
  players: GolfPlayer[];
  coaches: GolfCoach[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useGolfTeam(teamId?: string): UseGolfTeamResult {
  const supabase = createClient();
  const [team, setTeam] = useState<GolfTeam | null>(null);
  const [players, setPlayers] = useState<GolfPlayer[]>([]);
  const [coaches, setCoaches] = useState<GolfCoach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeam = async () => {
    setLoading(true);
    setError(null);

    try {
      let targetTeamId = teamId;

      // If no teamId provided, get from current user
      if (!targetTeamId) {
        const { data: { user } } = await (supabase as any).auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        // Check if coach
        const { data: coach } = await (supabase as any)
          .from('golf_coaches')
          .select('team_id')
          .eq('user_id', user.id)
          .single();

        if (coach?.team_id) {
          targetTeamId = coach.team_id;
        } else {
          // Check if player
          const { data: player } = await (supabase as any)
            .from('golf_players')
            .select('team_id')
            .eq('user_id', user.id)
            .single();

          if (player?.team_id) {
            targetTeamId = player.team_id;
          }
        }
      }

      if (!targetTeamId) {
        setError('No team found');
        return;
      }

      // Fetch team
      const { data: teamData, error: teamError } = await (supabase as any)
        .from('golf_teams')
        .select('*, organization:golf_organizations(*)')
        .eq('id', targetTeamId)
        .single();

      if (teamError) throw teamError;
      setTeam(teamData as GolfTeam);

      // Fetch players
      const { data: playersData, error: playersError } = await (supabase as any)
        .from('golf_players')
        .select('*')
        .eq('team_id', targetTeamId)
        .order('last_name', { ascending: true });

      if (playersError) throw playersError;
      setPlayers(playersData as GolfPlayer[]);

      // Fetch coaches
      const { data: coachesData, error: coachesError } = await (supabase as any)
        .from('golf_coaches')
        .select('*')
        .eq('team_id', targetTeamId);

      if (coachesError) throw coachesError;
      setCoaches(coachesData as GolfCoach[]);
    } catch (err) {
      console.error('Error fetching golf team:', err);
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, [teamId]);

  return {
    team,
    players,
    coaches,
    loading,
    error,
    refetch: fetchTeam,
  };
}
