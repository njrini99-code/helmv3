'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { profilesById, readGolfPlayerProfiles } from '@/lib/golf/player-profiles';
import { observeRealtimeChannel } from '@/lib/observability/supabase/realtime';

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
  // This is the server-enforced qualifier round cap. Keep it in the realtime
  // shape so a coach's cap edit is not represented by a stale local contract.
  num_rounds: number;
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

/** A burst of changes (a coach correcting several entries) becomes one re-read, as on Clubhouse's board. */
export const QUALIFIER_REFETCH_COALESCE_MS = 800;

/**
 * Whether a golf_rounds change can move the leaderboard, which counts only
 * completed rounds. A round being played writes its row on every auto-save;
 * those changes leave the standings as they were and re-reading the whole
 * board for each of them is wasted work for every viewer. golf_rounds has the
 * default replica identity, so an UPDATE carries no old status: a round that
 * leaves "completed" (reopened) is caught by its id, from the rounds the last
 * read counted.
 */
export function roundChangeMovesStandings(
  row: { id?: unknown; status?: unknown } | null | undefined,
  countedRoundIds: ReadonlySet<string>,
): boolean {
  if (!row) return true;
  if (row.status === 'completed') return true;
  return typeof row.id === 'string' && countedRoundIds.has(row.id);
}

/**
 * Hook for real-time qualifier leaderboard updates
 *
 * Subscribes to:
 * - golf_qualifier_entries: For position/score changes
 * - golf_rounds: For round submissions and changes to counted rounds (where
 *   qualifier_id matches); an in-progress round's auto-saves are ignored
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
  // The completed rounds the last read returned, so a counted round that is reopened still re-reads the board.
  const countedRoundIdsRef = useRef<ReadonlySet<string>>(new Set());

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

      // Fetch leaderboard entries, then the entrants' names through
      // golf_player_profiles: a player may no longer read a teammate's
      // golf_players row (security review S4).
      const { data: entriesData, error: entriesError } = await supabase
        .from('golf_qualifier_entries')
        .select('*')
        .eq('qualifier_id', qualifierId)
        .order('position', { ascending: true, nullsFirst: false });

      if (entriesError) throw entriesError;

      const entrantProfiles = await readGolfPlayerProfiles(supabase, { playerIds: (entriesData || []).map((e) => e.player_id) });
      if (entrantProfiles.error) throw entrantProfiles.error;
      const entrantById = profilesById(entrantProfiles.data);

      // The rounds that count, the rule the selection workspace confirms from
      // and Clubhouse draws (docs/clubhouse/pages/P009-qualifiers/WIRING.md,
      // "Standings parity"): linked by qualifier_id, completed, not a test.
      const { data: roundsData, error: roundsError } = await supabase
        .from('golf_rounds')
        .select('id, player_id, qualifier_round_number, total_score, score_to_par, status, is_test')
        .eq('qualifier_id', qualifierId)
        .eq('status', 'completed')
        .eq('is_test', false)
        .order('id', { ascending: true });

      if (roundsError) throw roundsError;
      countedRoundIdsRef.current = new Set((roundsData || []).map((round) => round.id));

      // Build per-player round aggregates
      const playerRoundAggregates = new Map<string, {
        roundsCompleted: number;
        totalScore: number;
        totalToPar: number;
      }>();
      const seenSlots = new Set<string>();

      for (const round of roundsData || []) {
        // Held here too, so the board's round set never depends on the query alone.
        if (round.status !== 'completed' || round.is_test === true) continue;
        // A round without a total or a to-par is unknown, not a free zero.
        if (round.total_score == null || round.score_to_par == null) continue;
        // A second round in one numbered slot counts once (the first by id); a
        // round with no stored number is in no slot and always counts.
        if (round.qualifier_round_number != null) {
          const slot = `${round.player_id}:${round.qualifier_round_number}`;
          if (seenSlots.has(slot)) continue;
          seenSlots.add(slot);
        }

        const existing = playerRoundAggregates.get(round.player_id) ?? {
          roundsCompleted: 0,
          totalScore: 0,
          totalToPar: 0,
        };

        existing.roundsCompleted += 1;
        existing.totalScore += round.total_score;
        existing.totalToPar += round.score_to_par;

        playerRoundAggregates.set(round.player_id, existing);
      }

      // Transform to include player name and scoring aggregates
      // Cast entry to Record to access columns that may not be in generated types yet
      const transformedEntries: QualifierLeaderboardEntry[] = (entriesData || []).map((entry) => {
        const raw = entry as Record<string, unknown>;
        const player = entrantById.get(entry.player_id) ?? null;
        const roundAgg = playerRoundAggregates.get(entry.player_id);

        // The counted rounds only. The stored entry aggregate is never a
        // fallback: it goes stale, and a player with no counted round is
        // unscored, not ranked on old totals.
        const roundsCompleted = roundAgg?.roundsCompleted ?? 0;
        const totalScore = roundAgg ? roundAgg.totalScore : null;
        const totalToPar = roundAgg ? roundAgg.totalToPar : null;

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

    let refetchTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefetch = () => {
      clearTimeout(refetchTimer);
      refetchTimer = setTimeout(() => {
        void fetchQualifierData();
      }, QUALIFIER_REFETCH_COALESCE_MS);
    };
    const onRoundChange = (payload: { new: unknown }) => {
      const row = payload.new as { id?: unknown; status?: unknown } | null;
      if (roundChangeMovesStandings(row, countedRoundIdsRef.current)) scheduleRefetch();
    };

    // Set up real-time subscription for qualifier entries (scores/positions)
    const channel = observeRealtimeChannel(
      supabase
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
        // Refetch to get updated leaderboard with positions
        scheduleRefetch
      )
      // Listen for rounds submitted for this qualifier
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'golf_rounds',
          filter: `qualifier_id=eq.${qualifierId}`,
        },
        onRoundChange
      )
      // Listen for round updates (a round signed, a counted round corrected or
      // reopened); an in-progress round's auto-saves do not move the standings
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'golf_rounds',
          filter: `qualifier_id=eq.${qualifierId}`,
        },
        onRoundChange
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
      ),
      { feature: 'golf.qualifiers', channelClass: 'golf_qualifiers', subscriptionType: 'postgres_changes' },
    );

    return () => {
      clearTimeout(refetchTimer);
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
