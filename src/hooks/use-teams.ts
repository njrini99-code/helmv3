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
        .from('team_coach_staff')
        .select(`
          team_id,
          role,
          is_primary,
          teams (
            id,
            name,
            team_type,
            logo_url,
            primary_color,
            age_group,
            city,
            state
          )
        `)
        .eq('coach_id', coach.id);

      if (staffError) {
        console.error('Error fetching teams from staff:', staffError.message);
      }

      // Also check if coach is head_coach of any teams
      const { data: headCoachData, error: headError } = await supabase
        .from('teams')
        .select('id, name, team_type, logo_url, primary_color, age_group, city, state')
        .eq('head_coach_id', coach.id);

      if (headError) {
        console.error('Error fetching head coach teams:', headError.message);
      }

      // Combine and deduplicate
      const teamMap = new Map<string, Team>();

      // Add head coach teams
      (headCoachData || []).forEach((team) => {
        teamMap.set(team.id, team as Team);
      });

      // Add staff teams
      (staffData || []).forEach((item) => {
        const team = item.teams as any;
        if (team && !teamMap.has(team.id)) {
          teamMap.set(team.id, team as Team);
        }
      });

      // Get member counts for each team
      const teamIds = Array.from(teamMap.keys());
      if (teamIds.length > 0) {
        const { data: memberCounts } = await supabase
          .from('team_members')
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
