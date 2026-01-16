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
 */
export function QualifierLeaderboardRealtime({
  qualifierId,
  numRounds = 1,
}: QualifierLeaderboardRealtimeProps) {
  const { leaderboard: entries, qualifier, loading, error } = useQualifierRealtime(qualifierId);

  // Transform real-time data to leaderboard format
  const leaderboard = useMemo(() => {
    if (!entries || entries.length === 0) return [];

    // Sort by score (lower is better for golf)
    const sorted = [...entries].sort((a, b) => {
      if ((a.score ?? Infinity) !== (b.score ?? Infinity)) {
        return (a.score ?? Infinity) - (b.score ?? Infinity);
      }
      return 0;
    });

    // Mark ties and transform to expected format
    return sorted.map((entry, index) => {
      const isTied = index > 0 && (sorted[index]?.score === sorted[index - 1]?.score);

      return {
        playerId: entry.player_id,
        playerName: entry.player_name,
        roundsCompleted: entry.round_id ? 1 : 0, // Simplified - would need round data
        totalScore: entry.score ?? 0,
        totalToPar: 0, // Would need course par data
        averageScore: entry.score ?? 0,
        isTied,
      };
    });
  }, [entries]);

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-flex items-center gap-2 text-slate-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
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
      numRounds={numRounds}
      showLiveLeaderboard={isLive}
    />
  );
}
