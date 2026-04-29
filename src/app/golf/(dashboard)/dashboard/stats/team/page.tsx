import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { TeamStatsTable } from './team-stats-table';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { getTeamStatsIntelligence } from '@/app/golf/actions/stats-intelligence';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Stats Overview | Helm Golf',
  description: 'View and compare statistics for all players on your team',
};

// Cache for 5 minutes
export const revalidate = 300;

export interface TeamPlayerStats {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
  rounds_played: number;
  scoring_average: number | null;
  best_round: number | null;
  worst_round: number | null;
  fairway_pct: number | null;
  gir_pct: number | null;
  putts_per_round: number | null;
  birdies_per_round: number | null;
  scoring_trend: number | null; // Difference from previous period
  // Per-format stats (9 vs 18 holes)
  rounds_played_18: number;
  rounds_played_9: number;
  scoring_average_18: number | null;
  scoring_average_9: number | null;
  best_round_18: number | null;
  best_round_9: number | null;
}

export default async function TeamStatsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
  if (!coach) redirect('/golf/dashboard/stats'); // coach-only page

  const supabase = await createClient();

  // Get team_id from golf_teams via organization_id
  let teamId: string | null = null;
  let team: { name: string } | null = null;
  if (coach.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id, name')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = orgTeam?.id || null;
    team = orgTeam ? { name: orgTeam.name } : null;
  }

  if (!teamId) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-[20px] font-medium text-warm-900 tracking-[-0.015em] mb-2">No Team Found</h2>
          <p className="text-warm-500">
            Create a team first to view team statistics.
          </p>
        </div>
      </div>
    );
  }

  // Get all team members first, then get their player data
  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  const playerIds = (teamMembers || []).map(tm => tm.player_id);

  // Get player data - use graduation_year (actual DB column name)
  const { data: players } = playerIds.length > 0
    ? await supabase
        .from('golf_players')
        .select('id, first_name, last_name, avatar_url, graduation_year, handicap')
        .in('id', playerIds)
        .order('last_name')
    : { data: [] };

  if (!players || players.length === 0) {
    return (
      <div className="min-h-full">
        <MobileNavHeader
          title="Team Stats Overview"
          subtitle={team?.name || 'Your Team'}
          backHref="/golf/dashboard/stats"
          backLabel="Stats"
        />
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-16 text-center">
          <p className="text-warm-500">No players on your roster yet.</p>
        </div>
      </div>
    );
  }

  // Fetch ALL rounds for ALL players in a single query (performance optimization).
  // Run CoachHelm intelligence fetch in parallel — it reads already-persisted
  // engine output and doesn't block the raw stats query.
  const allPlayerIds = players.map(p => p.id);

  const [roundsResult, intelligenceResult] = await Promise.all([
    supabase
      .from('golf_rounds')
      .select('id, player_id, total_score, round_date, holes_played')
      .in('player_id', allPlayerIds)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false }),
    getTeamStatsIntelligence(teamId),
  ]);
  const { data: allRounds } = roundsResult;

  // Fetch ALL holes for calculating GIR and fairway stats
  const roundIds = (allRounds || []).map(r => r.id);

  const { data: allHoles } = roundIds.length > 0
    ? await supabase
        .from('golf_holes')
        .select('round_id, par, fairway_hit, gir, putts, score')
        .in('round_id', roundIds)
    : { data: [] };

  // Define types for the grouped data
  type RoundData = { id: string; player_id: string; total_score: number | null; round_date: string; holes_played: number | null };
  type HoleData = { round_id: string; par: number; fairway_hit: boolean | null; gir: boolean | null; putts: number | null; score: number | null };

  // Group data by player in memory
  const roundsByPlayer: Record<string, RoundData[]> = {};
  for (const round of (allRounds || [])) {
    const playerId = round.player_id;
    if (!roundsByPlayer[playerId]) {
      roundsByPlayer[playerId] = [];
    }
    roundsByPlayer[playerId]!.push(round as RoundData);
  }

  const holesByRound: Record<string, HoleData[]> = {};
  for (const hole of (allHoles || [])) {
    const roundId = hole.round_id;
    if (!holesByRound[roundId]) {
      holesByRound[roundId] = [];
    }
    holesByRound[roundId]!.push(hole as HoleData);
  }

  // Calculate comprehensive stats for each player
  const playersWithStats: TeamPlayerStats[] = players.map(player => {
    const playerRounds = roundsByPlayer[player.id] || [];
    const scoredRounds = playerRounds.filter(r => r.total_score !== null);

    // Normalize to 18-hole equivalents + split by format
    let totalStrokes = 0;
    let totalHolesScored = 0;
    let totalStrokes18 = 0;
    let totalStrokes9 = 0;
    let roundsPlayed18 = 0;
    let roundsPlayed9 = 0;
    const normalizedScores: number[] = [];
    const scores18: number[] = [];
    const scores9: number[] = [];
    for (const r of scoredRounds) {
      const hp = r.holes_played ?? 18;
      const score = r.total_score as number;
      totalStrokes += score;
      totalHolesScored += hp;
      normalizedScores.push(Math.round(score * (18 / hp)));
      if (hp <= 9) {
        totalStrokes9 += score;
        roundsPlayed9++;
        scores9.push(score);
      } else {
        totalStrokes18 += score;
        roundsPlayed18++;
        scores18.push(score);
      }
    }

    const roundsPlayed = scoredRounds.length;
    const scoringAverage = totalHolesScored > 0
      ? (totalStrokes / totalHolesScored) * 18
      : null;
    const scoringAverage18 = roundsPlayed18 > 0
      ? totalStrokes18 / roundsPlayed18
      : null;
    const scoringAverage9 = roundsPlayed9 > 0
      ? totalStrokes9 / roundsPlayed9
      : null;
    const bestRound = normalizedScores.length > 0 ? Math.min(...normalizedScores) : null;
    const worstRound = normalizedScores.length > 0 ? Math.max(...normalizedScores) : null;
    const bestRound18 = scores18.length > 0 ? Math.min(...scores18) : null;
    const bestRound9 = scores9.length > 0 ? Math.min(...scores9) : null;

    // Calculate scoring trend (last 5 vs previous 5) using normalized scores
    let scoringTrend: number | null = null;
    if (normalizedScores.length >= 6) {
      const recent5 = normalizedScores.slice(0, 5);
      const previous5 = normalizedScores.slice(5, 10);
      if (previous5.length >= 3) {
        const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length;
        const prevAvg = previous5.reduce((a, b) => a + b, 0) / previous5.length;
        scoringTrend = recentAvg - prevAvg; // Negative is good (improving)
      }
    }

    // Aggregate hole stats
    let totalFairwayHits = 0;
    let totalFairwayOpps = 0;
    let totalGirHits = 0;
    let totalGirOpps = 0;
    let totalPutts = 0;
    let totalBirdies = 0;
    let totalHolesWithScore = 0;

    playerRounds.forEach(round => {
      const holes = holesByRound[round.id] || [];
      holes.forEach(hole => {
        // Fairway (only par 4s and 5s)
        // Match the player stats calculator: every par 4 / par 5 is a fairway
        // opportunity, even if the explicit hole flag is missing.
        if (hole.par >= 4) {
          totalFairwayOpps++;
          if (hole.fairway_hit) totalFairwayHits++;
        }
        // GIR
        if (hole.gir !== null) {
          totalGirOpps++;
          if (hole.gir) totalGirHits++;
        }
        // Putts
        if (hole.putts !== null && hole.putts > 0) {
          totalPutts += hole.putts;
        }
        // Birdies (score <= par - 1)
        if (hole.score !== null) {
          totalHolesWithScore++;
          if (hole.score <= hole.par - 1) totalBirdies++;
        }
      });
    });

    const fairwayPct = totalFairwayOpps > 0
      ? (totalFairwayHits / totalFairwayOpps) * 100
      : null;
    const girPct = totalGirOpps > 0
      ? (totalGirHits / totalGirOpps) * 100
      : null;
    // Normalize putts to 18-hole equivalent
    const totalPlayerHoles = scoredRounds.reduce((sum, r) => sum + (r.holes_played ?? 18), 0);
    const puttsPerRound = totalPlayerHoles > 0 && totalPutts > 0
      ? (totalPutts / totalPlayerHoles) * 18
      : null;

    // Birdies per round: normalize to 18-hole equivalent
    // golf_holes.score is stored per-hole — null values indicate pre-score-tracking rounds
    const birdiesPerRound = totalHolesWithScore > 0
      ? (totalBirdies / totalHolesWithScore) * 18
      : null;

    return {
      id: player.id,
      first_name: player.first_name || '',
      last_name: player.last_name || '',
      avatar_url: player.avatar_url,
      graduation_year: player.graduation_year,
      handicap: player.handicap,
      rounds_played: roundsPlayed,
      scoring_average: scoringAverage,
      best_round: bestRound,
      worst_round: worstRound,
      fairway_pct: fairwayPct,
      gir_pct: girPct,
      putts_per_round: puttsPerRound,
      birdies_per_round: birdiesPerRound,
      scoring_trend: scoringTrend,
      rounds_played_18: roundsPlayed18,
      rounds_played_9: roundsPlayed9,
      scoring_average_18: scoringAverage18,
      scoring_average_9: scoringAverage9,
      best_round_18: bestRound18,
      best_round_9: bestRound9,
    };
  });

  return (
    <AnimatedPage className="min-h-full">
      {/* Header */}
      <AnimatedItem>
        <MobileNavHeader
          title="Team Stats Overview"
          subtitle={`${team?.name || 'Your Team'} • ${playersWithStats.length} player${playersWithStats.length !== 1 ? 's' : ''}`}
          backHref="/golf/dashboard/stats"
          backLabel="Stats"
        />
      </AnimatedItem>

      {/* Table */}
      <AnimatedItem>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 pb-24">
        <TeamStatsTable
          players={playersWithStats}
          intelligenceByPlayer={intelligenceResult.success && intelligenceResult.data
            ? Object.fromEntries(
                intelligenceResult.data.players.map((p) => [
                  p.playerId,
                  {
                    composite: p.composite,
                    overall: p.categories?.overall ?? null,
                    topInsightTitle: p.topInsight?.title ?? null,
                    topInsightPriority: p.topInsight?.priority ?? null,
                    insightCount: p.insightCount,
                  },
                ]),
              )
            : {}}
        />
      </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}
