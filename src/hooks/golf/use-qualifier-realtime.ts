'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Qualifier leaderboard entry with player info and scoring aggregates
 * Based on golf_qualifier_entries table schema
 */
export interface QualifierLeaderboardEntry {
  id: string;
  qualifier_id: string;
  player_id: string;
  player_name: string;
  position: number | null;
  score: number | null;
  total_score: number | null;
  total_to_par: number | null;
  rounds_completed: number;
  is_tied: boolean;
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
  num_rounds: number;
  holes_per_round: number;
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
  coursePar: number | null;
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
  const [coursePar, setCoursePar] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchQualifierData = useCallback(async () => {
    if (!qualifierId) {
      setQualifier(null);
      setLeaderboard([]);
      setCoursePar(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch qualifier details with course par via join
      const { data: qualifierData, error: qualifierError } = await supabase
        .from('golf_qualifiers')
        .select(`
          *,
          course:golf_courses(id, par)
        `)
        .eq('id', qualifierId)
        .single();

      if (qualifierError) throw qualifierError;

      const qualifierDetails = qualifierData as QualifierDetails & {
        course: { id: string; par: number | null } | null;
      };
      setQualifier(qualifierDetails);

      // Extract course par (from linked course, or null)
      const fetchedCoursePar = qualifierDetails.course?.par ?? null;
      setCoursePar(fetchedCoursePar);

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

      // Fetch all qualifier rounds to compute per-player aggregates
      const { data: roundsData, error: roundsError } = await supabase
        .from('golf_rounds')
        .select('player_id, total_score, score_to_par, status')
        .eq('qualifier_id', qualifierId);

      if (roundsError) throw roundsError;

      // Build per-player round aggregates
      const playerRoundAggregates = new Map<string, {
        roundsCompleted: number;
        totalScore: number;
        totalToPar: number;
      }>();

      for (const round of roundsData || []) {
        const existing = playerRoundAggregates.get(round.player_id) ?? {
          roundsCompleted: 0,
          totalScore: 0,
          totalToPar: 0,
        };

        if (round.status === 'completed') {
          existing.roundsCompleted += 1;
        }
        existing.totalScore += round.total_score ?? 0;
        existing.totalToPar += round.score_to_par ?? 0;

        playerRoundAggregates.set(round.player_id, existing);
      }

      // Transform to include player name and scoring aggregates
      const transformedEntries: QualifierLeaderboardEntry[] = (entriesData || []).map((entry) => {
        const player = entry.player as { id: string; first_name: string | null; last_name: string | null } | null;
        const roundAgg = playerRoundAggregates.get(entry.player_id);

        // Prefer DB-persisted values, fall back to computed aggregates from rounds
        const roundsCompleted = (entry.rounds_completed as number | null) ?? roundAgg?.roundsCompleted ?? 0;
        const totalScore = (entry.total_score as number | null) ?? (roundAgg ? roundAgg.totalScore : null);
        const totalToPar = (entry.total_to_par as number | null) ?? (roundAgg ? roundAgg.totalToPar : null);

        return {
          id: entry.id,
          qualifier_id: entry.qualifier_id,
          player_id: entry.player_id,
          player_name: player
            ? `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player'
            : 'Unknown Player',
          position: entry.position,
          score: entry.score,
          total_score: totalScore,
          total_to_par: totalToPar,
          rounds_completed: roundsCompleted,
          is_tied: (entry.is_tied as boolean | null) ?? false,
          status: entry.status,
          notes: entry.notes,
          round_id: entry.round_id,
          created_at: entry.created_at,
          updated_at: entry.updated_at,
        };
      });

      setLeaderboard(transformedEntries);
    } catch (err) {
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
    coursePar,
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
