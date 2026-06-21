'use client';

import { useQualifierRealtime } from '@/hooks/golf/use-qualifier-realtime';
import { QualifierViewTabs } from '@/app/golf/(dashboard)/dashboard/qualifiers/[id]/QualifierViewTabs';
import { useMemo } from 'react';

interface QualifierLeaderboardRealtimeProps {
  qualifierId: string;
  numRounds?: number;
}

/**
 * Real-time leaderboard component that subscribes to qualifier updates.
 * Wraps QualifierViewTabs with live data from Supabase real-time.
 *
 * Scoring logic:
 * - roundsCompleted: Actual count of completed rounds from golf_rounds
 * - totalScore: Sum of total_score across all qualifier rounds
 * - totalToPar: Sum of score_to_par across all qualifier rounds
 * - averageScore: totalScore / roundsCompleted (when rounds exist)
 */
export function QualifierLeaderboardRealtime({
  qualifierId,
  numRounds = 1,
}: QualifierLeaderboardRealtimeProps) {
  const { leaderboard: entries, qualifier, loading, error } = useQualifierRealtime(qualifierId);

  // F029/F138: golf_qualifiers has no num_rounds column, so there is no stored
  // per-qualifier round count to read — honor the caller-supplied prop (the
  // honest fallback). The detail page passes 1 today; if a real column is ever
  // added, source it here.
  const effectiveNumRounds = numRounds;

  // Transform real-time data to leaderboard format with proper scoring
  const leaderboard = useMemo(() => {
    if (!entries || entries.length === 0) return [];

    // Sort by total-to-par (lower is better), then by total score as tiebreaker.
    // Players with no completed rounds sort to the bottom.
    const sorted = [...entries].sort((a, b) => {
      const aCompleted = a.rounds_completed > 0;
      const bCompleted = b.rounds_completed > 0;

      // Players with rounds sort above those without
      if (aCompleted && !bCompleted) return -1;
      if (!aCompleted && bCompleted) return 1;
      if (!aCompleted && !bCompleted) return 0;

      // Both have rounds: sort by total-to-par ascending
      const aToPar = a.total_to_par ?? Infinity;
      const bToPar = b.total_to_par ?? Infinity;
      if (aToPar !== bToPar) return aToPar - bToPar;

      // Tiebreaker: lower total score
      const aScore = a.total_score ?? Infinity;
      const bScore = b.total_score ?? Infinity;
      return aScore - bScore;
    });

    return sorted.map((entry, index) => {
      const totalScore = entry.total_score ?? 0;
      const totalToPar = entry.total_to_par ?? 0;
      const roundsCompleted = entry.rounds_completed;
      const averageScore = roundsCompleted > 0
        ? totalScore / roundsCompleted
        : 0;

      // Determine tie status: same total-to-par as adjacent entry
      const prevEntry = index > 0 ? sorted[index - 1] : undefined;
      const isTied = entry.is_tied || (
        prevEntry !== undefined &&
        prevEntry.rounds_completed > 0 &&
        roundsCompleted > 0 &&
        prevEntry.total_to_par === entry.total_to_par
      );

      return {
        playerId: entry.player_id,
        playerName: entry.player_name,
        roundsCompleted,
        totalScore,
        totalToPar,
        averageScore,
        isTied,
      };
    });
  }, [entries]);

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-flex items-center gap-2 text-warm-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
          </span>
          Loading live leaderboard...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-rose-600">
        <p>Error loading leaderboard: {error}</p>
      </div>
    );
  }

  const isLive = qualifier?.status === 'in_progress';

  return (
    <QualifierViewTabs
      leaderboard={leaderboard}
      numRounds={effectiveNumRounds}
      showLiveLeaderboard={isLive}
    />
  );
}
