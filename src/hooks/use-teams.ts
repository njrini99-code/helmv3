'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useTeamStore, type Team } from '@/stores/team-store';

/**
 * Hook to load and manage teams for a coach
 * Primarily used for Showcase coaches who manage multiple teams
 */
export function useTeams() {
  const { coach } = useAuthStore();
  const { teams, selectedTeamId, setTeams, setSelectedTeamId, setIsLoading, isLoading, getSelectedTeam } = useTeamStore();

  useEffect(() => {
    async function fetchTeams() {
      if (!coach?.id) {
        setTeams([]);
        return;
      }

      setIsLoading(true);
      const supabase = createClient();

      // Get teams where this coach is the head coach or on staff
      const { data: staffData, error: staffError } = await supabase
        .from('baseball_team_coach_staff')
        .select(`
          team_id,
          role,
          is_primary,
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
        .eq('coach_id', coach.id);

      if (staffError) {
        console.error('Error fetching teams from staff:', staffError.message);
      }

      // baseball_teams does not have a head_coach_id column.
      // All coach-team relationships are managed via baseball_team_coach_staff.

      // Build team map from staff entries
      const teamMap = new Map<string, Team>();

      (staffData || []).forEach((item) => {
        const team = item.baseball_teams as Team | null;
        if (team && !teamMap.has(team.id)) {
          teamMap.set(team.id, team);
        }
      });

      // Get member counts for each team
      const teamIds = Array.from(teamMap.keys());
      if (teamIds.length > 0) {
        const { data: memberCounts } = await supabase
          .from('baseball_team_members')
          .select('team_id')
          .in('team_id', teamIds)
          .eq('status', 'active');

        // Count members per team
        const counts = new Map<string, number>();
        (memberCounts || []).forEach((m) => {
          counts.set(m.team_id, (counts.get(m.team_id) || 0) + 1);
        });

        // Add counts to teams
        teamMap.forEach((team, id) => {
          team.member_count = counts.get(id) || 0;
        });
      }

      const teamsArray = Array.from(teamMap.values());
      setTeams(teamsArray);
      setIsLoading(false);
    }

    fetchTeams();
  }, [coach?.id, setTeams, setIsLoading]);

  return {
    teams,
    selectedTeamId,
    selectedTeam: getSelectedTeam(),
    setSelectedTeamId,
    isLoading,
    hasMultipleTeams: teams.length > 1,
  };
}
