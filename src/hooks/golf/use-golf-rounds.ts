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
        const { data: { user } } = await (supabase as any).auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        const { data: player } = await (supabase as any)
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
      const { data: roundsData, error: roundsError } = await (supabase as any)
        .from('golf_rounds')
        .select('*, holes:golf_holes(*)')
        .eq('player_id', targetPlayerId)
        .order('round_date', { ascending: false });

      if (roundsError) throw roundsError;
      setRounds(roundsData as GolfRound[]);

      // Calculate stats
      if (roundsData && roundsData.length > 0) {
        const roundsPlayed = roundsData.length;
        const scores = roundsData.map((r: any) => r.total_score).filter((s: any): s is number => s !== null);
        const scoringAverage = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
        const bestRound = scores.length > 0 ? Math.min(...scores) : 0;

        // Calculate score distribution from holes
        let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubleBogeys = 0;
        let totalPutts = 0, fairwaysHit = 0, fairwaysTotal = 0, greensInReg = 0, greensTotal = 0;
        let par3Scores: number[] = [], par4Scores: number[] = [], par5Scores: number[] = [];

        roundsData.forEach((round: any) => {
          if (round.holes) {
            round.holes.forEach((hole: { score_to_par: number; par: number; score: number; putts?: number; fairway_hit?: boolean; green_in_regulation?: boolean }) => {
              // Score distribution
              if (hole.score_to_par <= -2) eagles++;
              else if (hole.score_to_par === -1) birdies++;
              else if (hole.score_to_par === 0) pars++;
              else if (hole.score_to_par === 1) bogeys++;
              else if (hole.score_to_par >= 2) doubleBogeys++;

              // Par-specific averages
              if (hole.par === 3) par3Scores.push(hole.score);
              else if (hole.par === 4) par4Scores.push(hole.score);
              else if (hole.par === 5) par5Scores.push(hole.score);

              // Putting
              if (hole.putts) totalPutts += hole.putts;

              // Fairways (only count par 4s and 5s)
              if (hole.par >= 4) {
                fairwaysTotal++;
                if (hole.fairway_hit) fairwaysHit++;
              }

              // Greens
              greensTotal++;
              if (hole.green_in_regulation) greensInReg++;
            });
          }

          // Also use round totals if available
          if (round.total_putts) totalPutts = round.total_putts;
          if (round.fairways_hit) fairwaysHit = round.fairways_hit;
          if (round.fairways_total) fairwaysTotal = round.fairways_total;
          if (round.greens_in_regulation) greensInReg = round.greens_in_regulation;
          if (round.greens_total) greensTotal = round.greens_total;
        });

        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined;

        setStats({
          scoringAverage,
          bestRound,
          roundsPlayed,
          handicap: undefined, // Would come from player record
          puttingAverage: totalPutts > 0 ? totalPutts / roundsPlayed : undefined,
          fairwayPercentage: fairwaysTotal > 0 ? (fairwaysHit / fairwaysTotal) * 100 : undefined,
          girPercentage: greensTotal > 0 ? (greensInReg / greensTotal) * 100 : undefined,
          eagles,
          birdies,
          pars,
          bogeys,
          doubleBogeys,
          par3Average: avg(par3Scores),
          par4Average: avg(par4Scores),
          par5Average: avg(par5Scores),
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
