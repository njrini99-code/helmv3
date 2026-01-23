import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamStatsTable } from './team-stats-table';
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
}

export default async function TeamStatsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Check if user is a coach - this page is COACH ONLY
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  // If not a coach, redirect to regular stats page
  if (coachError || !coach) {
    redirect('/golf/dashboard/stats');
  }

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">No Team Found</h2>
          <p className="text-slate-500">
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
      <div className="min-h-screen">
        <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-5">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Team Stats Overview</h1>
            <p className="text-slate-500 mt-0.5">{team?.name || 'Your Team'}</p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <p className="text-slate-500">No players on your roster yet.</p>
        </div>
      </div>
    );
  }

  // Fetch ALL rounds for ALL players in a single query (performance optimization)
  const allPlayerIds = players.map(p => p.id);

  const { data: allRounds } = await supabase
    .from('golf_rounds')
    .select('id, player_id, total_score, round_date')
    .in('player_id', allPlayerIds)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .order('round_date', { ascending: false });

  // Fetch ALL holes for calculating GIR and fairway stats
  const roundIds = (allRounds || []).map(r => r.id);

  const { data: allHoles } = roundIds.length > 0
    ? await supabase
        .from('golf_holes')
        .select('round_id, par, fairway_hit, gir, putts')
        .in('round_id', roundIds)
    : { data: [] };

  // Define types for the grouped data
  type RoundData = { id: string; player_id: string; total_score: number | null; round_date: string };
  type HoleData = { round_id: string; par: number; fairway_hit: boolean | null; gir: boolean | null; putts: number | null };

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
    const scores = playerRounds
      .filter(r => r.total_score !== null)
      .map(r => r.total_score as number);

    const roundsPlayed = scores.length;
    const scoringAverage = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;
    const bestRound = scores.length > 0 ? Math.min(...scores) : null;
    const worstRound = scores.length > 0 ? Math.max(...scores) : null;

    // Calculate scoring trend (last 5 vs previous 5)
    let scoringTrend: number | null = null;
    if (scores.length >= 6) {
      const recent5 = scores.slice(0, 5);
      const previous5 = scores.slice(5, 10);
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

    playerRounds.forEach(round => {
      const holes = holesByRound[round.id] || [];
      holes.forEach(hole => {
        // Fairway (only par 4s and 5s)
        if (hole.par >= 4 && hole.fairway_hit !== null) {
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
        // Birdies (score = par - 1 or better)
        // We'd need score per hole, but we can estimate from total
      });
    });

    const fairwayPct = totalFairwayOpps > 0
      ? (totalFairwayHits / totalFairwayOpps) * 100
      : null;
    const girPct = totalGirOpps > 0
      ? (totalGirHits / totalGirOpps) * 100
      : null;
    const puttsPerRound = roundsPlayed > 0 && totalPutts > 0
      ? totalPutts / roundsPlayed
      : null;

    // Estimate birdies per round (rough approximation)
    // A proper implementation would query golf_holes for score per hole
    const birdiesPerRound = null; // Would need additional data

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
    };
  });

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Team Stats Overview</h1>
              <p className="text-slate-500 mt-0.5">
                {team?.name || 'Your Team'} • {playersWithStats.length} player{playersWithStats.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <TeamStatsTable players={playersWithStats} />
      </div>
    </div>
  );
}
