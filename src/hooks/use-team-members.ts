'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TeamMember } from '@/lib/types/calendar';

export function useTeamMembers(teamId?: string) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTeamMembers() {
      try {
        setLoading(true);
        setError(null);
        const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // If teamId is provided, fetch members for that team
        if (teamId) {
          const { data, error: membersError } = await supabase
            .from('baseball_team_members')
            .select(`
              id,
              player_id,
              baseball_players:player_id (
                id,
                first_name,
                last_name,
                avatar_url,
                user_id
              )
            `)
            .eq('team_id', teamId);

          if (membersError) throw membersError;

          interface MemberRow {
            id: string;
            player_id: string;
            players?: {
              id: string;
              first_name?: string;
              last_name?: string;
              avatar_url?: string;
              user_id?: string;
            } | null;
          }

          const teamMembers = ((data || []) as unknown as MemberRow[]).map((member) => ({
            id: member.id,
            user_id: member.players?.user_id || member.player_id,
            full_name: member.players ? `${member.players.first_name || ''} ${member.players.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
            avatar_url: member.players?.avatar_url,
            role: 'player' as const,
          }));

          setMembers(teamMembers);
        } else {
          // No team specified - fetch organization members or default to empty
          setMembers([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch team members');
      } finally {
        setLoading(false);
      }
    }

    fetchTeamMembers();
  }, [teamId]);

  return {
    members,
    loading,
    error,
  };
}
