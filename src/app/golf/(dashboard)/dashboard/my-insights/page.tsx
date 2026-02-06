import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MyInsightsContent } from './MyInsightsContent';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

// Force dynamic rendering - requires Supabase auth at runtime
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'GolfHelm | My Insights',
  description: 'Your personalized golf performance insights and recommendations',
};

/**
 * Player Insights Dashboard - GolfHelm
 *
 * Shows personalized insights, stats summary, and recommendations for players.
 * Works independently of CoachHelm team settings.
 */
export default async function MyInsightsPage() {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/golf/login');
  }

  // Get player record
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name, handicap')
    .eq('user_id', user.id)
    .single();

  if (playerError || !player) {
    redirect('/golf/login');
  }

  // Fetch player stats - last 30 days of rounds
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentRounds } = await supabase
    .from('golf_rounds')
    .select('id, course_name, round_date, total_score, score_to_par, total_putts, total_fairways_hit, total_gir, status')
    .eq('player_id', player.id)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .gte('round_date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('round_date', { ascending: false });

  // Fetch all-time stats
  const { data: allRounds } = await supabase
    .from('golf_rounds')
    .select('total_score, score_to_par, total_putts, total_fairways_hit, total_gir')
    .eq('player_id', player.id)
    .eq('status', 'completed')
    .not('total_score', 'is', null);

  // Fetch focus areas if they exist
  const { data: focusAreas } = await supabase
    .from('golf_player_focus_areas')
    .select('id, title, description, priority, area_type')
    .eq('player_id', player.id)
    .eq('status', 'active')
    .order('priority', { ascending: true })
    .limit(5);

  // Calculate stats
  const stats = calculatePlayerStats(recentRounds || [], allRounds || []);

  return (
    <AnimatedPage>
      <AnimatedItem>
        <MyInsightsContent
          playerName={`${player.first_name} ${player.last_name}`.trim()}
          playerId={player.id}
          handicap={player.handicap}
          stats={stats}
          recentRounds={recentRounds || []}
          focusAreas={focusAreas || []}
        />
      </AnimatedItem>
    </AnimatedPage>
  );
}

interface RoundData {
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
}

function calculatePlayerStats(recentRounds: RoundData[], allRounds: RoundData[]) {
  const validRecent = recentRounds.filter(r => r.total_score !== null);
  const validAll = allRounds.filter(r => r.total_score !== null);

  // Recent stats (last 30 days)
  const recentScores = validRecent.map(r => r.total_score!);
  const recentAvg = recentScores.length > 0
    ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length
    : null;
  const recentBest = recentScores.length > 0 ? Math.min(...recentScores) : null;

  // All-time stats
  const allScores = validAll.map(r => r.total_score!);
  const allTimeAvg = allScores.length > 0
    ? allScores.reduce((a, b) => a + b, 0) / allScores.length
    : null;
  const allTimeBest = allScores.length > 0 ? Math.min(...allScores) : null;

  // Putting average
  const recentPutts = validRecent.filter(r => r.total_putts !== null).map(r => r.total_putts!);
  const avgPutts = recentPutts.length > 0
    ? recentPutts.reduce((a, b) => a + b, 0) / recentPutts.length
    : null;

  // GIR percentage
  const recentGir = validRecent.filter(r => r.total_gir !== null).map(r => r.total_gir!);
  const avgGir = recentGir.length > 0
    ? recentGir.reduce((a, b) => a + b, 0) / recentGir.length
    : null;
  const girPercent = avgGir !== null ? (avgGir / 18) * 100 : null;

  // Fairways percentage
  const recentFw = validRecent.filter(r => r.total_fairways_hit !== null).map(r => r.total_fairways_hit!);
  const avgFw = recentFw.length > 0
    ? recentFw.reduce((a, b) => a + b, 0) / recentFw.length
    : null;
  const fwPercent = avgFw !== null ? (avgFw / 14) * 100 : null;

  // Score to par average
  const recentScoreToPar = validRecent.filter(r => r.score_to_par !== null).map(r => r.score_to_par!);
  const avgScoreToPar = recentScoreToPar.length > 0
    ? recentScoreToPar.reduce((a, b) => a + b, 0) / recentScoreToPar.length
    : null;

  // Trend calculation (compare last 5 to previous 5)
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (recentScores.length >= 6) {
    const recent5 = recentScores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const previous5 = recentScores.slice(5, 10).reduce((a, b) => a + b, 0) / Math.min(5, recentScores.length - 5);
    if (recent5 < previous5 - 1) trend = 'improving';
    else if (recent5 > previous5 + 1) trend = 'declining';
  }

  return {
    roundsPlayed: validRecent.length,
    roundsAllTime: validAll.length,
    scoringAverage: recentAvg,
    allTimeAverage: allTimeAvg,
    bestScore: recentBest,
    allTimeBest: allTimeBest,
    avgPutts,
    girPercent,
    fwPercent,
    avgScoreToPar,
    trend,
  };
}
