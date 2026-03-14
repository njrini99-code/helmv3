import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import { Metadata } from 'next';
import { PlayerInsightClient } from './player-insight-client';

export const metadata: Metadata = {
  title: 'Player Insight | Helm Golf',
  description: 'View comprehensive AI-powered insights, patterns, and performance data for a player',
};

export const revalidate = 60;

// ---------------------------------------------------------------------------
// Types for data fetched on this page
// ---------------------------------------------------------------------------

interface PlayerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
}

interface RoundRow {
  id: string;
  created_at: string;
  round_date: string | null;
  total_score: number | null;
  holes_played: number | null;
  course_name: string | null;
  course_par: number | null;
  fairways_hit: number | null;
  greens_in_regulation: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_gir_possible: number | null;
}

interface PatternRow {
  id: string;
  pattern_type: string | null;
  name: string | null;
  description: string | null;
  severity: string | null;
  stroke_impact: number | null;
  lifecycle_stage: string | null;
  first_detected_at: string | null;
  is_active: boolean | null;
  created_at: string;
}

interface InsightRow {
  id: string;
  title: string | null;
  content: string | null;
  tone: string | null;
  confidence: number | null;
  dismissed: boolean | null;
  acknowledged: boolean | null;
  created_at: string;
}

interface FocusAreaRow {
  id: string;
  title: string | null;
  area_type: string | null;
  status: string | null;
  current_value: number | null;
  target_value: number | null;
  created_at: string;
}

interface PredictionRow {
  id: string;
  prediction_type: string | null;
  title: string | null;
  predicted_value: number | null;
  confidence: number | null;
  timeframe: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function PlayerInsightPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
  if (!coach) redirect('/golf/dashboard');

  const supabase = await createClient();

  // -----------------------------------------------------------------------
  // 1. Auth check — verify this coach's org owns the team containing this player
  // -----------------------------------------------------------------------
  let teamId: string | null = null;

  if (coach.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = orgTeam?.id || null;
  }

  if (!teamId) redirect('/golf/dashboard/roster');

  // Verify player is on this team
  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .maybeSingle();

  if (!membership) notFound();

  // -----------------------------------------------------------------------
  // 2. Fetch all data in parallel
  // -----------------------------------------------------------------------
  const [
    playerResult,
    roundsResult,
    patternsResult,
    insightsResult,
    focusAreasResult,
    predictionsResult,
  ] = await Promise.all([
    // Player profile
    supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url, graduation_year, handicap')
      .eq('id', playerId)
      .maybeSingle(),

    // Recent rounds (last 10)
    supabase
      .from('golf_rounds')
      .select('id, created_at, round_date, total_score, holes_played, course_name, course_par, fairways_hit, greens_in_regulation, total_putts, total_fairways, total_gir_possible')
      .eq('player_id', playerId)
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(10),

    // Active patterns
    supabase
      .from('golf_patterns_v2')
      .select('id, pattern_type, name, description, severity, stroke_impact, lifecycle_stage, first_detected_at, is_active, created_at')
      .eq('player_id', playerId)
      .eq('is_active', true)
      .order('stroke_impact', { ascending: true }),

    // Insights (not dismissed)
    supabase
      .from('golf_coach_insights')
      .select('id, title, content, tone, confidence, dismissed, acknowledged, created_at')
      .eq('player_id', playerId)
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(20),

    // Focus areas
    supabase
      .from('golf_player_focus_areas')
      .select('id, title, area_type, status, current_value, target_value, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),

    // Predictions
    supabase
      .from('golf_predictions')
      .select('id, prediction_type, title, predicted_value, confidence, timeframe, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const player = (playerResult.data as PlayerProfile | null) ?? null;
  if (!player) notFound();

  const rounds = (roundsResult.data as RoundRow[] | null) ?? [];
  const patterns = (patternsResult.data as PatternRow[] | null) ?? [];
  const insights = (insightsResult.data as InsightRow[] | null) ?? [];
  const focusAreas = (focusAreasResult.data as FocusAreaRow[] | null) ?? [];
  const predictions = (predictionsResult.data as PredictionRow[] | null) ?? [];

  // -----------------------------------------------------------------------
  // 3. Compute composite rating (simple heuristic) from available data
  // -----------------------------------------------------------------------
  const compositeRating = computeCompositeRating(rounds, patterns, focusAreas);
  const categoryBreakdown = computeCategoryBreakdown(rounds);
  const trendSummary = computeTrendSummary(rounds);
  const playerStatus = derivePlayerStatus(trendSummary.trend);

  return (
    <PlayerInsightClient
      player={player}
      compositeRating={compositeRating}
      categoryBreakdown={categoryBreakdown}
      trendSummary={trendSummary}
      playerStatus={playerStatus}
      rounds={rounds}
      patterns={patterns}
      insights={insights}
      focusAreas={focusAreas}
      predictions={predictions}
    />
  );
}

// ---------------------------------------------------------------------------
// Computation helpers
// ---------------------------------------------------------------------------

function computeCompositeRating(
  rounds: RoundRow[],
  patterns: PatternRow[],
  focusAreas: FocusAreaRow[],
): number {
  if (rounds.length === 0) return 50;

  // Score based on recent scoring relative to par
  const recentRounds = rounds.slice(0, 5);
  let scoreComponent = 50;
  const scoringDiffs = recentRounds
    .filter((r) => r.total_score && r.course_par)
    .map((r) => (r.total_score! - r.course_par!) / (r.holes_played === 9 ? 0.5 : 1));

  if (scoringDiffs.length > 0) {
    const avgOverPar = scoringDiffs.reduce((a, b) => a + b, 0) / scoringDiffs.length;
    // +0 → 80, +10 → 50, +20 → 20, -5 → 95
    scoreComponent = Math.max(0, Math.min(100, 80 - avgOverPar * 3));
  }

  // Penalty for severe patterns
  const severeCount = patterns.filter((p) => p.severity === 'critical' || p.severity === 'high').length;
  const patternPenalty = Math.min(20, severeCount * 5);

  // Bonus for active focus areas with progress
  const progressBonus = focusAreas.filter(
    (fa) => fa.status === 'active' && fa.current_value && fa.target_value && fa.current_value > 0,
  ).length * 2;

  return Math.round(Math.max(0, Math.min(100, scoreComponent - patternPenalty + progressBonus)));
}

interface CategoryBreakdown {
  teeGame: number;
  approach: number;
  shortGame: number;
  putting: number;
  scoring: number;
}

function computeCategoryBreakdown(rounds: RoundRow[]): CategoryBreakdown {
  if (rounds.length === 0) {
    return { teeGame: 50, approach: 50, shortGame: 50, putting: 50, scoring: 50 };
  }

  const recent = rounds.slice(0, 5);

  // Tee Game — fairways hit percentage (use actual total_fairways per round, fallback to 14)
  const fairwayRounds = recent.filter((r) => r.fairways_hit !== null);
  const teeGame = fairwayRounds.length > 0
    ? Math.round(
        (fairwayRounds.reduce((s, r) => s + (r.fairways_hit ?? 0), 0) /
         fairwayRounds.reduce((s, r) => s + (r.total_fairways ?? 14), 0)) * 100
      )
    : 50;

  // Approach — GIR percentage (use actual total_gir_possible per round, fallback to 18)
  const girRounds = recent.filter((r) => r.greens_in_regulation !== null);
  const approach = girRounds.length > 0
    ? Math.round(
        (girRounds.reduce((s, r) => s + (r.greens_in_regulation ?? 0), 0) /
         girRounds.reduce((s, r) => s + (r.total_gir_possible ?? 18), 0)) * 100
      )
    : 50;

  // Putting — based on putts per round (30 putts = 60, 36+ = 30, 25 = 90)
  const puttRounds = recent.filter((r) => r.total_putts !== null);
  const putting = puttRounds.length > 0
    ? Math.round(
        Math.max(0, Math.min(100,
          90 - ((puttRounds.reduce((s, r) => s + (r.total_putts ?? 0), 0) / puttRounds.length) - 25) * 5,
        )),
      )
    : 50;

  // Short game — estimated as the average of other categories (no direct data available)
  const shortGame = Math.round((teeGame + approach + putting) / 3);

  // Scoring — based on total_score vs par
  const scoringRounds = recent.filter((r) => r.total_score && r.course_par);
  const scoring = scoringRounds.length > 0
    ? Math.round(
        Math.max(0, Math.min(100,
          80 - ((scoringRounds.reduce((s, r) => s + (r.total_score! - r.course_par!), 0) / scoringRounds.length) * 3),
        )),
      )
    : 50;

  return {
    teeGame: Math.max(0, Math.min(100, teeGame)),
    approach: Math.max(0, Math.min(100, approach)),
    shortGame: Math.max(0, Math.min(100, shortGame)),
    putting: Math.max(0, Math.min(100, putting)),
    scoring: Math.max(0, Math.min(100, scoring)),
  };
}

interface TrendSummary {
  trend: 'improving' | 'stable' | 'declining';
  recentAvg: number;
  previousAvg: number;
  streakCount: number;
  streakType: 'positive' | 'negative' | 'neutral';
}

function computeTrendSummary(rounds: RoundRow[]): TrendSummary {
  const defaults: TrendSummary = {
    trend: 'stable',
    recentAvg: 0,
    previousAvg: 0,
    streakCount: 0,
    streakType: 'neutral',
  };

  const scoredRounds = rounds.filter((r) => r.total_score && r.course_par);
  if (scoredRounds.length < 2) return defaults;

  const diffs = scoredRounds.map((r) => r.total_score! - r.course_par!);
  const mid = Math.floor(diffs.length / 2);
  const recentAvg = diffs.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const previousAvg = diffs.slice(mid).reduce((a, b) => a + b, 0) / (diffs.length - mid);

  const diff = previousAvg - recentAvg;
  const trend: TrendSummary['trend'] = diff > 1.5 ? 'improving' : diff < -1.5 ? 'declining' : 'stable';

  // Compute streak
  let streakCount = 1;
  let streakType: TrendSummary['streakType'] = diffs[0] <= 0 ? 'positive' : diffs[0] > 5 ? 'negative' : 'neutral';
  for (let i = 1; i < diffs.length; i++) {
    const currentType = diffs[i] <= 0 ? 'positive' : diffs[i] > 5 ? 'negative' : 'neutral';
    if (currentType === streakType) {
      streakCount++;
    } else {
      break;
    }
  }

  return { trend, recentAvg, previousAvg, streakCount, streakType };
}

function derivePlayerStatus(trend: TrendSummary['trend']): 'Improving' | 'Needs Attention' | 'Stable' {
  switch (trend) {
    case 'improving':
      return 'Improving';
    case 'declining':
      return 'Needs Attention';
    default:
      return 'Stable';
  }
}
