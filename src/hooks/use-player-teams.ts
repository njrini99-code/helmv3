'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTeamStore, type Team } from '@/stores/team-store';

/**
 * Hook to load and manage teams for a player
 * Players can be members of up to 2 baseball_teams (HS + Showcase)
 */
export function usePlayerTeams() {
  const { player } = useAuthStore();
  const { teams, selectedTeamId, setTeams, setSelectedTeamId, setIsLoading, isLoading, getSelectedTeam } = useTeamStore();

  useEffect(() => {
    async function fetchPlayerTeams() {
      if (!player?.id) {
        setTeams([]);
        return;
      }

      setIsLoading(true);
      const supabase = createClient();

      // Get teams where this player is a member
      const { data: memberData, error: memberError } = await supabase
        .from('baseball_team_members')
        .select(`
          team_id,
          jersey_number,
          joined_at,
          baseball_teams (
            id,
            name,
            team_type,
            logo_url,
            primary_color,
            secondary_color,
            description
          )
        `)
        .eq('player_id', player.id)
        .eq('status', 'active');

      if (memberError) {
        console.error('Error fetching player teams:', memberError.message);
        setIsLoading(false);
        return;
      }

      // Extract teams from member data
      const playerTeams: Team[] = (memberData || [])
        .map((item: { baseball_teams: Team | null }) => item.baseball_teams)
        .filter((team): team is Team => team !== null);

      setTeams(playerTeams);
      setIsLoading(false);
    }

    fetchPlayerTeams();
  }, [player?.id, setTeams, setIsLoading]);

  return {
    teams,
    selectedTeamId,
    selectedTeam: getSelectedTeam(),
    setSelectedTeamId,
    isLoading,
    hasMultipleTeams: teams.length > 1,
  };
}
