'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Qualifier leaderboard entry with player info and scoring aggregates
 * Based on golf_qualifier_entries table schema
 */
interface QualifierLeaderboardEntry {
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
interface QualifierDetails {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  course_name: string | null;
  course_id: string | null;
  // F029/F138: golf_qualifiers has NO num_rounds / holes_per_round columns
  // (removed in the 2026-05-27 schema rebuild). They were declared here but the
  // `select('*')` never populated them, so every read was silently `undefined`.
  // Removed so the typed shape matches the real table.
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
  const supabase = useMemo(() => createClient(), []);

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
        // Only count completed rounds for scoring aggregates
        if (round.status !== 'completed') continue;

        const existing = playerRoundAggregates.get(round.player_id) ?? {
          roundsCompleted: 0,
          totalScore: 0,
          totalToPar: 0,
        };

        existing.roundsCompleted += 1;
        existing.totalScore += round.total_score ?? 0;
        existing.totalToPar += round.score_to_par ?? 0;

        playerRoundAggregates.set(round.player_id, existing);
      }

      // Transform to include player name and scoring aggregates
      // Cast entry to Record to access columns that may not be in generated types yet
      const transformedEntries: QualifierLeaderboardEntry[] = (entriesData || []).map((entry) => {
        const raw = entry as Record<string, unknown>;
        const player = entry.player as { id: string; first_name: string | null; last_name: string | null } | null;
        const roundAgg = playerRoundAggregates.get(entry.player_id);

        // Prefer computed aggregates from rounds query (realtime), fall back to DB-persisted values
        const roundsCompleted = roundAgg?.roundsCompleted ?? (raw.rounds_completed as number | null) ?? 0;
        const totalScore = (roundAgg ? roundAgg.totalScore : null) ?? (raw.total_score as number | null);
        const totalToPar = (roundAgg ? roundAgg.totalToPar : null) ?? (raw.total_to_par as number | null);

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
          is_tied: (raw.is_tied as boolean | null) ?? false,
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
  }, [qualifierId, supabase]);

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
          const update = payload.new as Partial<QualifierDetails>;
          setQualifier((prev) => prev ? { ...prev, ...update } : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qualifierId, fetchQualifierData, supabase]);

  return {
    qualifier,
    leaderboard,
    coursePar,
    loading,
    error,
    refetch: fetchQualifierData,
  };
}
