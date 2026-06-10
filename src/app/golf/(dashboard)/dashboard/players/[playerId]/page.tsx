import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import { Metadata } from 'next';
import { PlayerInsightClient } from './player-insight-client';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayPlayerInsight } from '@/components/fairway/pages/coachhelm/FairwayPlayerInsight';
import { getThemesForCoach } from '@/app/golf/actions/insight-delivery';
import { logServerError } from '@/lib/server-error-logger';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';

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
  score_to_par: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_gir_possible: number | null;
}

interface PatternRow {
  id: string;
  pattern_type: string | null;
  /**
   * Derived client-side from metadata.description (the column `name`
   * and top-level `description` do not exist in live schema).
   */
  name: string | null;
  description: string | null;
  severity: string | null;
  stroke_impact: number | null;
  /** Live column name is `lifecycle_state` (not `lifecycle_stage`). */
  lifecycle_state: string | null;
  /** Live column name is `first_detected` (not `first_detected_at`). */
  first_detected: string | null;
  is_active: boolean | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface InsightRow {
  id: string;
  title: string | null;
  content: string | null;
  /** Derived client-side — no dedicated `tone` column in live schema. */
  tone: string | null;
  /** Derived client-side from metadata when present. */
  confidence: number | null;
  dismissed: boolean | null;
  /** Live schema stores acknowledgement via `acknowledged_at` timestamp. */
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
  /**
   * Replaces the phantom `prediction_type` + `title` fields. `metric` is
   * the live schema's descriptor; formatMetricLabel() turns it into a
   * human-readable title client-side.
   */
  metric: string | null;
  predicted_value: number | null;
  confidence: number | null;
  trend: string | null;
  due_date: string | null;
  prediction_context: Record<string, unknown> | null;
  related_round_id: string | null;
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
  // Deterministic org→team resolution (handles orgs with >1 team)
  const teamId = await resolveCoachTeamId(supabase, coach.organization_id, coach.id);

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
    themesResult,
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
      .select('id, created_at, round_date, total_score, holes_played, course_name, score_to_par, total_fairways_hit, total_gir, total_putts, total_fairways, total_gir_possible')
      .eq('player_id', playerId)
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(10),

    // Active patterns — cap to the 8 most impactful to avoid rendering
    // thousands of low-signal/contextual rows from historical mining.
    supabase
      .from('golf_patterns_v2')
      .select('id, pattern_type, severity, stroke_impact, lifecycle_state, first_detected, is_active, created_at, metadata')
      .eq('player_id', playerId)
      .eq('is_active', true)
      .order('stroke_impact', { ascending: true })
      .limit(8),

    // Insights (not dismissed). `tone` + `acknowledged` columns don't
    // exist on live schema — they're derived from metadata / acknowledged_at
    // in the client component. Apply the SAME shared product-visibility
    // contract (P2 legacy-surface): this SSR fetch feeds the flag-off
    // PlayerInsightClient, so it must not surface stale v2 phantoms or
    // archived/tentative rows. (In the redesign branch FairwayPlayerInsight
    // re-fetches via the already-filtered getInsightsForCoach.)
    applyInsightVisibility(
      supabase
        .from('golf_coach_insights')
        .select('id, title, content, metadata, dismissed, acknowledged_at, created_at')
        .eq('player_id', playerId)
        .eq('dismissed', false),
    )
      .order('created_at', { ascending: false })
      .limit(20),

    // Focus areas
    supabase
      .from('golf_player_focus_areas')
      .select('id, title, area_type, status, current_value, target_value, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),

    // Predictions — fetch a wider window so we can dedupe to one row per
    // metric (otherwise the seed engine produces many "Score To Par"
    // duplicates that all render as identical cards).
    supabase
      .from('golf_predictions')
      .select('id, metric, predicted_value, confidence, trend, due_date, prediction_context, related_round_id, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(40),

    // Hierarchical THEME scaffold for the redesigned coach surface. Per-player.
    // Degrades to null (→ []) on any failure so it never errors the page — but LOGS
    // the failure so a real load/auth/query regression is observable, not silent.
    getThemesForCoach({ player_id: playerId }).catch((err) => {
      void logServerError(
        `players page themes fetch failed (continuing without themes): ${err instanceof Error ? err.message : String(err)}`,
        { action: 'players-page.getThemesForCoach', featureArea: 'insights', playerId },
      ).catch(() => undefined);
      return null;
    }),
  ]);

  const player = (playerResult.data as PlayerProfile | null) ?? null;
  if (!player) notFound();

  const rounds = (roundsResult.data as RoundRow[] | null) ?? [];

  // Patterns: derive name/description from metadata since the live schema
  // has neither column (LIVE-8). Two metadata shapes coexist:
  //   - "conditional" patterns carry `name` + `description` directly.
  //   - "contextual" / shot-dispersion patterns carry a richer
  //     {situation, tendencies, recommendation, insight} blob — synthesize a
  //     human title from situation.distanceRange.label + lie, and use the
  //     embedded `insight` text as the description.
  // We also dedupe by the synthesized title so the 4-of-a-kind "Wedge from
  // rough" rows the miner emits collapse to one card.
  const rawPatterns = (patternsResult.data as Array<Record<string, unknown>> | null) ?? [];
  const seenTitles = new Set<string>();
  const patterns: PatternRow[] = [];
  for (const p of rawPatterns) {
    const meta = (p.metadata as Record<string, unknown> | null) ?? null;
    const metaDescription = typeof meta?.description === 'string' ? meta.description : null;
    const metaName = typeof meta?.name === 'string' ? meta.name : null;
    const metaInsight = typeof meta?.insight === 'string' ? meta.insight : null;
    const metaRecommendation = typeof meta?.recommendation === 'string' ? meta.recommendation : null;

    let name = metaName;
    const description = metaDescription ?? metaInsight ?? metaRecommendation;
    if (!name) {
      const situation = (meta?.situation as Record<string, unknown> | null) ?? null;
      const lie = typeof situation?.lie === 'string' ? situation.lie : null;
      const range = (situation?.distanceRange as Record<string, unknown> | null) ?? null;
      const rangeLabel = typeof range?.label === 'string' ? range.label : null;
      const tendencies = Array.isArray(meta?.tendencies)
        ? (meta?.tendencies as Array<Record<string, unknown>>)
        : [];
      const topTendency = tendencies[0];
      const direction = typeof topTendency?.direction === 'string'
        ? topTendency.direction.replace(/_/g, ' ')
        : null;

      if (rangeLabel && lie) {
        name = direction
          ? `${rangeLabel} from ${lie} → ${direction}`
          : `${rangeLabel} from ${lie}`;
      } else if (rangeLabel) {
        name = rangeLabel;
      } else if ((p.pattern_type as string | null) === 'contextual') {
        name = 'Shot pattern';
      } else {
        name = (p.pattern_type as string | null) ?? null;
      }
    }

    const dedupKey = (name ?? '').toLowerCase().trim();
    if (dedupKey && seenTitles.has(dedupKey)) continue;
    if (dedupKey) seenTitles.add(dedupKey);

    patterns.push({
      id: p.id as string,
      pattern_type: (p.pattern_type as string | null) ?? null,
      name,
      description,
      severity: (p.severity as string | null) ?? null,
      stroke_impact: (p.stroke_impact as number | null) ?? null,
      lifecycle_state: (p.lifecycle_state as string | null) ?? null,
      first_detected: (p.first_detected as string | null) ?? null,
      is_active: (p.is_active as boolean | null) ?? null,
      created_at: p.created_at as string,
      metadata: meta,
    });
  }

  // Insights: derive tone + acknowledged from live columns.
  const rawInsights = (insightsResult.data as Array<Record<string, unknown>> | null) ?? [];
  const insights: InsightRow[] = rawInsights.map((i) => {
    const meta = (i.metadata as Record<string, unknown> | null) ?? null;
    const tone = typeof meta?.tone === 'string' ? meta.tone : null;
    const confidence = typeof meta?.confidence === 'number' ? meta.confidence : null;
    return {
      id: i.id as string,
      title: (i.title as string | null) ?? null,
      content: (i.content as string | null) ?? null,
      tone,
      confidence,
      dismissed: (i.dismissed as boolean | null) ?? null,
      acknowledged: i.acknowledged_at != null,
      created_at: i.created_at as string,
    };
  });

  const focusAreas = (focusAreasResult.data as FocusAreaRow[] | null) ?? [];

  // Predictions: keep the most recent row per distinct metric — seed data
  // generates many duplicates per metric that all render as identical cards.
  const rawPredictions = (predictionsResult.data as Array<Record<string, unknown>> | null) ?? [];
  const seenMetrics = new Set<string>();
  const predictions: PredictionRow[] = [];
  for (const p of rawPredictions) {
    const metric = (p.metric as string | null) ?? null;
    const key = metric ?? '__null__';
    if (seenMetrics.has(key)) continue;
    seenMetrics.add(key);
    predictions.push({
      id: p.id as string,
      metric,
      predicted_value: (p.predicted_value as number | null) ?? null,
      confidence: (p.confidence as number | null) ?? null,
      trend: (p.trend as string | null) ?? null,
      due_date: (p.due_date as string | null) ?? null,
      prediction_context: (p.prediction_context as Record<string, unknown> | null) ?? null,
      related_round_id: (p.related_round_id as string | null) ?? null,
      created_at: p.created_at as string,
    });
    if (predictions.length >= 5) break;
  }

  // -----------------------------------------------------------------------
  // 3. Compute composite rating (simple heuristic) from available data
  // -----------------------------------------------------------------------
  const compositeRating = computeCompositeRating(rounds, patterns, focusAreas);
  const categoryBreakdown = computeCategoryBreakdown(rounds);
  const trendSummary = computeTrendSummary(rounds);
  const playerStatus = derivePlayerStatus(trendSummary.trend);

  // Hierarchical THEME scaffold — additive, redesign-only. Degrades to [] when
  // the fetch failed or returned no data (themesResult may be null on throw).
  const themes = themesResult?.data?.themes ?? [];

  // Fairway (warm-premium) fork — flag-gated re-skin of the coach Player Insight
  // surface. Same loaded data + same server actions (the client widget reuses
  // them verbatim). Legacy below stays byte-for-byte when flag-off.
  if (isRedesignEnabled()) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayPlayerInsight
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
          themes={themes}
        />
      </div>
    );
  }

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
    .filter((r) => r.score_to_par != null)
    .map((r) => (r.score_to_par ?? 0) / (r.holes_played === 9 ? 0.5 : 1));

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
  const fairwayRounds = recent.filter((r) => r.total_fairways_hit !== null);
  const teeGame = fairwayRounds.length > 0
    ? Math.round(
        (fairwayRounds.reduce((s, r) => s + (r.total_fairways_hit ?? 0), 0) /
         fairwayRounds.reduce((s, r) => s + (r.total_fairways ?? 14), 0)) * 100
      )
    : 50;

  // Approach — GIR percentage (use actual total_gir_possible per round, fallback to 18)
  const girRounds = recent.filter((r) => r.total_gir !== null);
  const approach = girRounds.length > 0
    ? Math.round(
        (girRounds.reduce((s, r) => s + (r.total_gir ?? 0), 0) /
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

  // Scoring — based on score_to_par
  const scoringRounds = recent.filter((r) => r.score_to_par != null);
  const scoring = scoringRounds.length > 0
    ? Math.round(
        Math.max(0, Math.min(100,
          80 - ((scoringRounds.reduce((s, r) => s + (r.score_to_par ?? 0), 0) / scoringRounds.length) * 3),
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

  const scoredRounds = rounds.filter((r) => r.score_to_par != null);
  if (scoredRounds.length < 2) return defaults;

  const diffs = scoredRounds.map((r) => r.score_to_par ?? 0);
  const mid = Math.floor(diffs.length / 2);
  const recentAvg = diffs.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const previousAvg = diffs.slice(mid).reduce((a, b) => a + b, 0) / (diffs.length - mid);

  const diff = previousAvg - recentAvg;
  const trend: TrendSummary['trend'] = diff > 1.5 ? 'improving' : diff < -1.5 ? 'declining' : 'stable';

  // Compute streak
  let streakCount = 1;
  const streakType: TrendSummary['streakType'] = (diffs[0] ?? 0) <= 0 ? 'positive' : (diffs[0] ?? 0) > 5 ? 'negative' : 'neutral';
  for (let i = 1; i < diffs.length; i++) {
    const currentType = (diffs[i] ?? 0) <= 0 ? 'positive' : (diffs[i] ?? 0) > 5 ? 'negative' : 'neutral';
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
