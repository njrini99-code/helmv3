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
            .from('team_members')
            .select(`
              id,
              user_id,
              users (
                id,
                full_name,
                avatar_url
              )
            `)
            .eq('team_id', teamId);

          if (membersError) throw membersError;

          const teamMembers = (data || []).map((member: any) => ({
            id: member.id,
            user_id: member.user_id,
            full_name: member.users?.full_name || 'Unknown',
            avatar_url: member.users?.avatar_url,
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
