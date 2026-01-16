'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Qualifier leaderboard entry with player info
 * Based on golf_qualifier_entries table schema
 */
export interface QualifierLeaderboardEntry {
  id: string;
  qualifier_id: string;
  player_id: string;
  player_name: string;
  position: number | null;
  score: number | null;
  status: string | null;
  notes: string | null;
  round_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Qualifier details
 * Based on golf_qualifiers table schema
 */
export interface QualifierDetails {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  course_name: string | null;
  course_id: string | null;
  start_date: string;
  end_date: string | null;
  entry_deadline: string | null;
  status: string | null;
  spots_available: number | null;
  rules: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface UseQualifierRealtimeResult {
  qualifier: QualifierDetails | null;
  leaderboard: QualifierLeaderboardEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for real-time qualifier leaderboard updates
 *
 * Subscribes to:
 * - golf_qualifier_entries: For position/score changes
 * - golf_rounds: For new round submissions (where qualifier_id matches)
 * - golf_qualifiers: For qualifier status changes
 *
 * @param qualifierId - The qualifier ID to subscribe to
 */
export function useQualifierRealtime(qualifierId: string | null): UseQualifierRealtimeResult {
  const [qualifier, setQualifier] = useState<QualifierDetails | null>(null);
  const [leaderboard, setLeaderboard] = useState<QualifierLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchQualifierData = useCallback(async () => {
    if (!qualifierId) {
      setQualifier(null);
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch qualifier details
      const { data: qualifierData, error: qualifierError } = await supabase
        .from('golf_qualifiers')
        .select('*')
        .eq('id', qualifierId)
        .single();

      if (qualifierError) throw qualifierError;
      setQualifier(qualifierData as QualifierDetails);

      // Fetch leaderboard entries with player info
      const { data: entriesData, error: entriesError } = await supabase
        .from('golf_qualifier_entries')
        .select(`
          *,
          player:golf_players(id, first_name, last_name)
        `)
        .eq('qualifier_id', qualifierId)
        .order('position', { ascending: true, nullsFirst: false });

      if (entriesError) throw entriesError;

      // Transform to include player name
      const transformedEntries: QualifierLeaderboardEntry[] = (entriesData || []).map((entry) => {
        const player = entry.player as { id: string; first_name: string | null; last_name: string | null } | null;
        return {
          id: entry.id,
          qualifier_id: entry.qualifier_id,
          player_id: entry.player_id,
          player_name: player
            ? `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player'
            : 'Unknown Player',
          position: entry.position,
          score: entry.score,
          status: entry.status,
          notes: entry.notes,
          round_id: entry.round_id,
          created_at: entry.created_at,
          updated_at: entry.updated_at,
        };
      });

      setLeaderboard(transformedEntries);
    } catch (err) {
      console.error('Error fetching qualifier data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load qualifier');
    } finally {
      setLoading(false);
    }
  }, [qualifierId]);

  useEffect(() => {
    fetchQualifierData();

    if (!qualifierId) return;

    // Set up real-time subscription for qualifier entries (scores/positions)
    const channel = supabase
      .channel(`qualifier-${qualifierId}`)
      // Listen for entry changes (score updates, position changes)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_qualifier_entries',
          filter: `qualifier_id=eq.${qualifierId}`,
        },
        () => {
          // Refetch to get updated leaderboard with positions
          fetchQualifierData();
        }
      )
      // Listen for new rounds submitted for this qualifier
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'golf_rounds',
          filter: `qualifier_id=eq.${qualifierId}`,
        },
        () => {
          // New round submitted - refetch leaderboard
          fetchQualifierData();
        }
      )
      // Listen for round updates (status changes, score corrections)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'golf_rounds',
          filter: `qualifier_id=eq.${qualifierId}`,
        },
        () => {
          fetchQualifierData();
        }
      )
      // Listen for qualifier status changes
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'golf_qualifiers',
          filter: `id=eq.${qualifierId}`,
        },
        (payload) => {
          // Update qualifier status in place
          setQualifier((prev) => prev ? { ...prev, ...payload.new } as QualifierDetails : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qualifierId, fetchQualifierData]);

  return {
    qualifier,
    leaderboard,
    loading,
    error,
    refetch: fetchQualifierData,
  };
}

/**
 * Hook for real-time updates across all active qualifiers for a team
 * Useful for dashboard views showing multiple qualifiers
 *
 * @param teamId - The team ID to get qualifiers for
 */
export function useTeamQualifiersRealtime(teamId: string | null) {
  const [qualifiers, setQualifiers] = useState<QualifierDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchQualifiers = useCallback(async () => {
    if (!teamId) {
      setQualifiers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('golf_qualifiers')
        .select('*')
        .eq('team_id', teamId)
        .in('status', ['scheduled', 'in_progress'])
        .order('start_date', { ascending: true });

      if (fetchError) throw fetchError;
      setQualifiers((data || []) as QualifierDetails[]);
    } catch (err) {
      console.error('Error fetching team qualifiers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load qualifiers');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchQualifiers();

    if (!teamId) return;

    const channel = supabase
      .channel(`team-qualifiers-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_qualifiers',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          fetchQualifiers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, fetchQualifiers]);

  return {
    qualifiers,
    loading,
    error,
    refetch: fetchQualifiers,
  };
}
