'use client';

import { useEffect, useState } from 'react';
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

  const fetchRounds = async () => {
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

      // Calculate stats
      if (roundsData && roundsData.length > 0) {
        const roundsPlayed = roundsData.length;
        type RoundWithScore = { total_score?: number | null };
        const scores = roundsData.map((r: RoundWithScore) => r.total_score).filter((s): s is number => s !== null && s !== undefined);
        const scoringAverage = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
        const bestRound = scores.length > 0 ? Math.min(...scores) : 0;
        const worstRound = scores.length > 0 ? Math.max(...scores) : 0;

        // Calculate score distribution from holes
        let totalPutts = 0, fairwaysHit = 0, fairwaysTotal = 0, greensInReg = 0, greensTotal = 0;

        type RoundData = {
          holes?: HoleData[];
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
          if (round.total_putts !== null && round.total_putts !== undefined) totalPutts = round.total_putts;
          if (round.total_fairways_hit !== null && round.total_fairways_hit !== undefined) fairwaysHit = round.total_fairways_hit;
          if (round.total_fairways !== null && round.total_fairways !== undefined) fairwaysTotal = round.total_fairways;
          if (round.total_gir !== null && round.total_gir !== undefined) greensInReg = round.total_gir;
          if (round.total_gir_possible !== null && round.total_gir_possible !== undefined) greensTotal = round.total_gir_possible;
        });

        const puttsPerRound = totalPutts > 0 ? totalPutts / roundsPlayed : 0;
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
  };

  useEffect(() => {
    fetchRounds();
  }, [playerId]);

  return {
    rounds,
    stats,
    loading,
    error,
    refetch: fetchRounds,
  };
}
