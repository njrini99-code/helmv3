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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        // Check if coach - get team via organization_id
        const { data: coach } = await supabase
          .from('golf_coaches')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();

        if (coach?.organization_id) {
          const { data: team } = await supabase
            .from('golf_teams')
            .select('id')
            .eq('organization_id', coach.organization_id)
            .maybeSingle();
          if (team?.id) {
            targetTeamId = team.id;
          }
        }

        // If not a coach or no team found, check if player via golf_team_members
        if (!targetTeamId) {
          const { data: player } = await supabase
            .from('golf_players')
            .select('id')
            .eq('user_id', user.id)
            .single();

          if (player?.id) {
            const { data: membership } = await supabase
              .from('golf_team_members')
              .select('team_id')
              .eq('player_id', player.id)
              .maybeSingle();
            if (membership?.team_id) {
              targetTeamId = membership.team_id;
            }
          }
        }
      }

      if (!targetTeamId) {
        setError('No team found');
        return;
      }

      // Fetch team
      const { data: teamData, error: teamError } = await supabase
        .from('golf_teams')
        .select('*, organization:golf_organizations(*)')
        .eq('id', targetTeamId)
        .single();

      if (teamError) throw teamError;
      setTeam(teamData as GolfTeam);

      // Fetch players via golf_team_members
      const { data: memberships, error: membershipsError } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', targetTeamId);

      if (membershipsError) throw membershipsError;

      const playerIds = memberships?.map(m => m.player_id) ?? [];
      if (playerIds.length > 0) {
        const { data: playersData, error: playersError } = await supabase
          .from('golf_players')
          .select('*')
          .in('id', playerIds)
          .order('last_name', { ascending: true });

        if (playersError) throw playersError;
        setPlayers(playersData as GolfPlayer[]);
      } else {
        setPlayers([]);
      }

      // Fetch coaches via organization_id from the team
      const organizationId = teamData?.organization_id;
      if (organizationId) {
        const { data: coachesData, error: coachesError } = await supabase
          .from('golf_coaches')
          .select('*')
          .eq('organization_id', organizationId);

        if (coachesError) throw coachesError;
        setCoaches(coachesData as GolfCoach[]);
      } else {
        setCoaches([]);
      }
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
