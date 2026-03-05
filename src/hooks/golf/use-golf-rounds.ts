'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { GolfRound, GolfPlayerStats } from '@/lib/types/golf';

interface UseGolfRoundsResult {
  rounds: GolfRound[];
  stats: GolfPlayerStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useGolfRounds(playerId?: string): UseGolfRoundsResult {
  const supabase = createClient();
  const [rounds, setRounds] = useState<GolfRound[]>([]);
  const [stats, setStats] = useState<GolfPlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRounds = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let targetPlayerId = playerId;

      // If no playerId provided, get from current user
      if (!targetPlayerId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        const { data: player } = await supabase
          .from('golf_players')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (!player) {
          setError('Player not found');
          return;
        }

        targetPlayerId = player.id;
      }

      // Fetch rounds
      const { data: roundsData, error: roundsError } = await supabase
        .from('golf_rounds')
        .select('*, holes:golf_holes(*)')
        .eq('player_id', targetPlayerId)
        .order('round_date', { ascending: false });

      if (roundsError) throw roundsError;
      setRounds(roundsData as GolfRound[]);

      // Calculate stats with 9-hole normalization
      if (roundsData && roundsData.length > 0) {
        const roundsPlayed = roundsData.length;
        type RoundWithScore = { total_score?: number | null; holes_played?: number | null };
        const scoredRounds = (roundsData as RoundWithScore[]).filter(r => r.total_score != null && r.total_score !== undefined);

        // Normalize scoring to 18-hole equivalents using per-hole average
        let totalStrokes = 0;
        let totalHolesScored = 0;
        const normalizedScores: number[] = [];
        for (const r of scoredRounds) {
          const hp = r.holes_played ?? 18;
          totalStrokes += r.total_score!;
          totalHolesScored += hp;
          normalizedScores.push(Math.round(r.total_score! * (18 / hp)));
        }
        const scoringAverage = totalHolesScored > 0 ? (totalStrokes / totalHolesScored) * 18 : 0;
        const bestRound = normalizedScores.length > 0 ? Math.min(...normalizedScores) : 0;
        const worstRound = normalizedScores.length > 0 ? Math.max(...normalizedScores) : 0;

        // Calculate score distribution from holes
        let totalPutts = 0, totalPuttsHoles = 0, fairwaysHit = 0, fairwaysTotal = 0, greensInReg = 0, greensTotal = 0;

        type RoundData = {
          holes?: HoleData[];
          holes_played?: number | null;
          total_putts?: number | null;
          total_fairways_hit?: number | null;
          total_fairways?: number | null;
          total_gir?: number | null;
          total_gir_possible?: number | null;
        };
        type HoleData = {
          par: number | null;
          score: number | null;
          putts?: number | null;
          fairway_hit?: boolean | null;
          gir?: boolean | null;
        };
        (roundsData as unknown as RoundData[]).forEach((round: RoundData) => {
          const hp = round.holes_played ?? 18;
          if (round.holes) {
            round.holes.forEach((hole: HoleData) => {
              // Putting
              if (hole.putts) totalPutts += hole.putts;

              // Fairways (only count par 4s and 5s)
              if (hole.par && hole.par >= 4) {
                fairwaysTotal++;
                if (hole.fairway_hit) fairwaysHit++;
              }

              // Greens
              greensTotal++;
              if (hole.gir) greensInReg++;
            });
          }

          // Also use round totals if available
          if (round.total_putts !== null && round.total_putts !== undefined) {
            totalPutts = round.total_putts;
            totalPuttsHoles += hp;
          }
          if (round.total_fairways_hit !== null && round.total_fairways_hit !== undefined) fairwaysHit = round.total_fairways_hit;
          if (round.total_fairways !== null && round.total_fairways !== undefined) fairwaysTotal = round.total_fairways;
          if (round.total_gir !== null && round.total_gir !== undefined) greensInReg = round.total_gir;
          if (round.total_gir_possible !== null && round.total_gir_possible !== undefined) greensTotal = round.total_gir_possible;
        });

        // Normalize putts to 18-hole equivalent
        const puttsPerRound = totalPuttsHoles > 0 ? (totalPutts / totalPuttsHoles) * 18 : 0;
        const fairwayPct = fairwaysTotal > 0 ? (fairwaysHit / fairwaysTotal) * 100 : 0;
        const girPct = greensTotal > 0 ? (greensInReg / greensTotal) * 100 : 0;

        setStats({
          rounds_played: roundsPlayed,
          total_rounds: roundsPlayed,
          scoring_average: scoringAverage,
          scoring_avg: scoringAverage,
          best_round: bestRound,
          worst_round: worstRound || 0,
          putts_per_round: puttsPerRound,
          avg_putts: puttsPerRound,
          fairways_hit_percentage: fairwayPct,
          fairway_percentage: fairwayPct,
          greens_in_regulation_percentage: girPct,
          gir_percentage: girPct,
          up_and_down_percentage: 0,
          strokes_gained: {
            sg_total: 0,
            sg_off_tee: 0,
            sg_approach: 0,
            sg_around_green: 0,
            sg_putting: 0,
          },
          handicap_index: undefined,
        });
      } else {
        setStats(null);
      }
    } catch (err) {
      console.error('Error fetching golf rounds:', err);
      setError(err instanceof Error ? err.message : 'Failed to load rounds');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase client is stable; only re-fetch when playerId changes
  }, [playerId]);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  return {
    rounds,
    stats,
    loading,
    error,
    refetch: fetchRounds,
  };
}
