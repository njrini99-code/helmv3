// Shared helpers, schemas and types split out of insights.ts.
// A plain server module, not a server-action surface (no server directive, no actions).

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ComposedInsight, MinedPattern, PerformancePrediction, PlayerAnalysis } from '@/lib/coachhelm/v2/types';
import type { InsightType, InsightPriority } from '@/lib/coachhelm/insight-types';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';
import { PHILOSOPHY_DEFAULTS } from '@/lib/coachhelm/constants';
import { logServerError } from '@/lib/server-error-logger';
import { verifyPlayerAccess as sharedVerifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { describeError } from '@/lib/utils/describe-error';
import { getStatsActionContext } from '@/lib/golf/stats-action-context';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Philosophy category for insight classification
 */
export type PhilosophyCategory =
  | 'ball_striking'
  | 'short_game'
  | 'putting'
  | 'course_management'
  | 'mental_game';
/**
 * Extended insight record with philosophy-based weighting
 */
export interface WeightedInsight extends InsightRecord {
  philosophyScore: number;           // 0-100 based on coach priorities
  matchesCoachPriority: boolean;     // Top priority badge flag
  priorityCategory: PhilosophyCategory;
  strokeImpactScore: number;         // Normalized stroke impact for comparison
}
export interface InsightRecord {
  coach_id: string;
  team_id: string;
  insight_type: string;
  priority: string;
  player_id: string | null;
  title: string;
  content: string;  // DB column is 'content', not 'description'
  metadata: Record<string, unknown>;  // recommendation goes in metadata
  status: 'active';
}
export interface PlayerStatsCacheRow {
  player_id: string;
  rounds_in_calculation: number | null;
  // Per-round SG averages — NOT strokes_gained_total/tee/approach/
  // around_green/putting, which are season-cumulative SUMs on the same
  // golf_player_stats_cache row (see #1297/#1300: reading the cumulative
  // family here produced coach-facing text like "SG Approach -85.84" for
  // a player whose actual per-round SG was -6.6 — the two families are
  // written atomically by the same function from the same query, so this
  // was always a reader-side column choice, not stale/inconsistent data).
  sg_total_per_round: number | null;
  sg_tee_per_round: number | null;
  sg_approach_per_round: number | null;
  sg_around_green_per_round: number | null;
  sg_putting_per_round: number | null;
  gir_percentage: number | null;
  driving_accuracy_percentage: number | null;
  scrambling_percentage: number | null;
  putts_per_round: number | null;
  approach_proximity_average: number | null;
}
// ============================================================================
// V2 INSIGHT CONVERSION HELPERS
// ============================================================================

/**
 * Maps V2 insight tone to V1 priority format for backwards compatibility
 */
function mapToneToPriority(tone: ComposedInsight['tone'], confidence: number): InsightPriority {
  if (tone === 'urgent') return 'urgent';
  if (tone === 'cautionary' && confidence > 0.7) return 'high';
  if (tone === 'cautionary') return 'medium';
  if (confidence < 0.5) return 'low';
  return 'medium';
}
/**
 * Determines insight type from V2 analysis data
 * Maps to allowed InsightType values defined in @/lib/coachhelm/insight-types:
 * 'scoring_decline' | 'stat_regression' | 'tournament_pressure' | 'plateau' |
 * 'bubble_player' | 'surge_player' | 'streak' | 'recurring_weakness' |
 * 'closing_holes' | 'par_3_issues' | 'team_trend' | 'roster_recommendation'
 */
function determineInsightType(
  insight: ComposedInsight,
  pattern?: MinedPattern,
  prediction?: PerformancePrediction
): InsightType {
  // Pattern-based insights
  if (pattern) {
    if (pattern.patternType === 'temporal') return 'scoring_decline';
    if (pattern.strokeImpact > 1.5) return 'recurring_weakness';
    if (pattern.outcome?.metric === 'tournament_score') return 'tournament_pressure';
  }

  // Prediction-based insights
  if (prediction) {
    if (prediction.trend === 'improving') return 'surge_player';
    if (prediction.trend === 'declining') return 'scoring_decline';
  }

  // Tone-based fallbacks
  if (insight.tone === 'celebratory') return 'surge_player';
  if (insight.tone === 'urgent') return 'bubble_player';
  if (insight.tone === 'cautionary') return 'scoring_decline';

  return 'team_trend';
}
// ============================================================================
// PHILOSOPHY HELPERS
// ============================================================================

// Database row type - Supabase types may not be updated after migration
interface PhilosophyDbRow {
  id: string;
  coach_id: string;
  priority_ball_striking: number | null;
  priority_short_game: number | null;
  priority_putting: number | null;
  priority_course_management: number | null;
  priority_mental_game: number | null;
  alert_sensitivity: string | null;
  decline_threshold: string | number | null;
  pressure_gap_threshold: string | number | null;
  bubble_zone_range: string | number | null;
  weight_historical?: number | null;
  weight_recent_form?: number | null;
  weight_tournament?: number | null;
  weight_qualifying?: number | null;
  weight_subjective?: number | null;
  alert_scoring_decline?: boolean | null;
  alert_stat_regression?: boolean | null;
  alert_tournament_pressure?: boolean | null;
  alert_plateau?: boolean | null;
  alert_bubble_player?: boolean | null;
  alert_surge_player?: boolean | null;
  alert_streaks?: boolean | null;
  alert_recurring_weakness?: boolean | null;
  alert_closing_holes?: boolean | null;
  alert_par_3_issues?: boolean | null;
  show_strokes_gained?: boolean | null;
  show_advanced_stats?: boolean | null;
  insight_verbosity?: string | null;
  // Migration 20260725090000 — optional so this parses against a database
  // where the migration has not been applied yet.
  min_insight_confidence?: string | number | null;
  min_rounds_for_signal?: number | null;
  alert_digest?: string | null;
  min_hole_plays_for_ranking?: number | null;
  pattern_lookback_days?: number | null;
  stats_benchmark_window_days?: number | null;
  created_at: string | null;
  updated_at: string | null;
}
/**
 * Fetches coach philosophy from database, returns defaults if not found
 */
export async function getCoachPhilosophy(
  coachId: string,
  client?: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>
): Promise<CoachPhilosophy> {
  const supabase = client ?? await createClient();

  // Resilient: a thrown query (transient DB error, etc.) must NOT propagate —
  // every caller can safely operate on the defaults below, so swallow the
  // throw to null and fall through to the `if (!data)` default path.
  let data: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (supabase as any) // nosemgrep: helmv3-server-action-missing-auth-check -- plain helper (no server directive, not an action); callers authenticate before calling it
      .from('golf_coach_philosophy')
      .select('*')
      .eq('coach_id', coachId)
      .maybeSingle();
    data = res?.data ?? null;
  } catch (philErr) {
    await logServerError(
      `getCoachPhilosophy query failed (using defaults): ${describeError(philErr)}`,
      { action: 'getCoachPhilosophy', featureArea: 'insights', extra: { coachId } },
      'warning',
    );
    data = null;
  }

  const defaults: CoachPhilosophy = {
    id: '',
    coachId,
    ...PHILOSOPHY_DEFAULTS,
    alertScoringDecline: true,
    alertStatRegression: true,
    alertTournamentPressure: true,
    alertPlateau: false,
    alertBubblePlayer: true,
    alertSurgePlayer: true,
    alertStreaks: true,
    alertRecurringWeakness: true,
    alertClosingHoles: false,
    alertPar3Issues: false,
    showStrokesGained: true,
    showAdvancedStats: true,
    insightVerbosity: 'detailed',
    // Signal controls (migration 20260725090000). These defaults ARE the
    // engine's prior hard-coded constants, so a coach with no row — or a
    // database where the migration has not landed — behaves exactly as before.
    minInsightConfidence: 0.3,
    minRoundsForSignal: 3,
    alertDigest: 'immediate',
    minHolePlaysForRanking: 3,
    patternLookbackDays: 90,
    statsBenchmarkWindowDays: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!data) {
    return defaults;
  }

  const row = data as PhilosophyDbRow;

  // Parse numeric values that might be strings
  const parseNum = (val: string | number | null | undefined, def: number): number => {
    if (val === null || val === undefined) return def;
    return typeof val === 'string' ? parseFloat(val) : val;
  };

  // Map snake_case to camelCase with proper null handling
  return {
    id: row.id,
    coachId: row.coach_id,
    priorityBallStriking: row.priority_ball_striking ?? defaults.priorityBallStriking,
    priorityShortGame: row.priority_short_game ?? defaults.priorityShortGame,
    priorityPutting: row.priority_putting ?? defaults.priorityPutting,
    priorityCourseManagement: row.priority_course_management ?? defaults.priorityCourseManagement,
    priorityMentalGame: row.priority_mental_game ?? defaults.priorityMentalGame,
    alertSensitivity: (row.alert_sensitivity as CoachPhilosophy['alertSensitivity']) ?? defaults.alertSensitivity,
    declineThreshold: parseNum(row.decline_threshold, defaults.declineThreshold),
    pressureGapThreshold: parseNum(row.pressure_gap_threshold, defaults.pressureGapThreshold),
    bubbleZoneRange: parseNum(row.bubble_zone_range, defaults.bubbleZoneRange),
    weightHistorical: row.weight_historical ?? defaults.weightHistorical,
    weightRecentForm: row.weight_recent_form ?? defaults.weightRecentForm,
    weightTournament: row.weight_tournament ?? defaults.weightTournament,
    weightQualifying: row.weight_qualifying ?? defaults.weightQualifying,
    weightSubjective: row.weight_subjective ?? defaults.weightSubjective,
    alertScoringDecline: row.alert_scoring_decline ?? defaults.alertScoringDecline,
    alertStatRegression: row.alert_stat_regression ?? defaults.alertStatRegression,
    alertTournamentPressure: row.alert_tournament_pressure ?? defaults.alertTournamentPressure,
    alertPlateau: row.alert_plateau ?? defaults.alertPlateau,
    alertBubblePlayer: row.alert_bubble_player ?? defaults.alertBubblePlayer,
    alertSurgePlayer: row.alert_surge_player ?? defaults.alertSurgePlayer,
    alertStreaks: row.alert_streaks ?? defaults.alertStreaks,
    alertRecurringWeakness: row.alert_recurring_weakness ?? defaults.alertRecurringWeakness,
    alertClosingHoles: row.alert_closing_holes ?? defaults.alertClosingHoles,
    alertPar3Issues: row.alert_par_3_issues ?? defaults.alertPar3Issues,
    showStrokesGained: row.show_strokes_gained ?? defaults.showStrokesGained,
    showAdvancedStats: row.show_advanced_stats ?? defaults.showAdvancedStats,
    insightVerbosity: row.insight_verbosity === 'detailed' ? 'detailed' : 'brief',
    minInsightConfidence: parseNum(row.min_insight_confidence, defaults.minInsightConfidence),
    minRoundsForSignal: row.min_rounds_for_signal ?? defaults.minRoundsForSignal,
    alertDigest:
      row.alert_digest === 'daily' || row.alert_digest === 'weekly'
        ? row.alert_digest
        : defaults.alertDigest,
    minHolePlaysForRanking: row.min_hole_plays_for_ranking ?? defaults.minHolePlaysForRanking,
    patternLookbackDays: row.pattern_lookback_days ?? defaults.patternLookbackDays,
    statsBenchmarkWindowDays:
      row.stats_benchmark_window_days ?? defaults.statsBenchmarkWindowDays,
    createdAt: row.created_at ?? defaults.createdAt,
    updatedAt: row.updated_at ?? defaults.updatedAt,
  };
}
/**
 * Filters insights based on coach philosophy alert toggles
 */
export function shouldIncludeInsight(insightType: InsightType, philosophy: CoachPhilosophy): boolean {
  const alertMap: Record<string, keyof CoachPhilosophy> = {
    scoring_decline: 'alertScoringDecline',
    stat_regression: 'alertStatRegression',
    tournament_pressure: 'alertTournamentPressure',
    plateau: 'alertPlateau',
    bubble_player: 'alertBubblePlayer',
    surge_player: 'alertSurgePlayer',
    streak: 'alertStreaks',
    recurring_weakness: 'alertRecurringWeakness',
    closing_holes: 'alertClosingHoles',
    par_3_issues: 'alertPar3Issues',
  };

  const alertKey = alertMap[insightType];
  if (!alertKey) return true; // Include unrecognized types by default

  return philosophy[alertKey] as boolean;
}
// ============================================================================
// PHILOSOPHY-WEIGHTED INSIGHT PRIORITIZATION
// ============================================================================

/**
 * Maps insight types and their metadata to philosophy categories
 * Uses insight type, title content, and metadata to determine category
 */
function categorizeInsight(insight: InsightRecord): PhilosophyCategory {
  const type = insight.insight_type;
  const title = insight.title.toLowerCase();
  const content = insight.content.toLowerCase();
  const metadata = insight.metadata || {};

  // Check metadata for explicit category
  if (metadata.category && typeof metadata.category === 'string') {
    const cat = metadata.category.toLowerCase();
    if (cat.includes('putting') || cat.includes('putt')) return 'putting';
    if (cat.includes('short') || cat.includes('scrambl') || cat.includes('around')) return 'short_game';
    if (cat.includes('ball') || cat.includes('driving') || cat.includes('approach') || cat.includes('tee')) return 'ball_striking';
    if (cat.includes('course') || cat.includes('manage') || cat.includes('penalty')) return 'course_management';
    if (cat.includes('mental') || cat.includes('pressure') || cat.includes('tournament')) return 'mental_game';
  }

  // Putting category detection
  if (
    type === 'performance_decline' && (title.includes('putt') || content.includes('putt') || content.includes('three-putt')) ||
    title.includes('putting') ||
    content.includes('putts per round') ||
    metadata.metric === 'strokes_gained_putting' ||
    metadata.stat_name === 'putting' ||
    title.includes('sg putting')
  ) {
    return 'putting';
  }

  // Short game category detection
  if (
    title.includes('scrambl') ||
    title.includes('around the green') ||
    title.includes('short game') ||
    title.includes('up-and-down') ||
    title.includes('sand save') ||
    content.includes('scrambling') ||
    metadata.metric === 'strokes_gained_around_green' ||
    metadata.stat_name === 'short_game'
  ) {
    return 'short_game';
  }

  // Ball striking category detection
  if (
    type === 'pattern_detected' && (title.includes('driv') || title.includes('fairway') || content.includes('tee shot')) ||
    title.includes('ball striking') ||
    title.includes('off the tee') ||
    title.includes('approach') ||
    title.includes('gir') ||
    title.includes('greens in regulation') ||
    title.includes('driving') ||
    title.includes('fairway') ||
    metadata.metric === 'strokes_gained_tee' ||
    metadata.metric === 'strokes_gained_approach' ||
    metadata.stat_name === 'ball_striking'
  ) {
    return 'ball_striking';
  }

  // Course management category detection
  if (
    title.includes('course management') ||
    title.includes('penalty') ||
    title.includes('decision') ||
    content.includes('course management') ||
    content.includes('penalty stroke') ||
    metadata.stat_name === 'course_management'
  ) {
    return 'course_management';
  }

  // Mental game category detection - pressure-related and tournament performance
  if (
    type === 'qualifying_watch' ||
    type === 'roster_alert' ||
    title.includes('pressure') ||
    title.includes('tournament') ||
    title.includes('mental') ||
    title.includes('closing hole') ||
    title.includes('back nine') ||
    content.includes('pressure') ||
    content.includes('tournament') ||
    content.includes('mental game') ||
    metadata.is_tournament_related ||
    metadata.is_pressure_related ||
    metadata.stat_name === 'mental_game'
  ) {
    return 'mental_game';
  }

  // Default to ball_striking for general performance insights
  return 'ball_striking';
}
/**
 * Gets the priority weight (1-5) for a category from philosophy
 * Lower number = higher priority (1 is most important)
 */
function getCategoryPriorityWeight(category: PhilosophyCategory, philosophy: CoachPhilosophy): number {
  switch (category) {
    case 'ball_striking':
      return philosophy.priorityBallStriking;
    case 'short_game':
      return philosophy.priorityShortGame;
    case 'putting':
      return philosophy.priorityPutting;
    case 'course_management':
      return philosophy.priorityCourseManagement;
    case 'mental_game':
      return philosophy.priorityMentalGame;
  }
}
/**
 * Calculates philosophy score for an insight (0-100)
 * Higher score = more aligned with coach priorities
 */
function calculatePhilosophyScore(
  insight: InsightRecord,
  category: PhilosophyCategory,
  philosophy: CoachPhilosophy
): number {
  // Get the priority weight for this category (1-5, 1 = highest priority)
  const priorityWeight = getCategoryPriorityWeight(category, philosophy);

  // Convert to a 0-60 base score (priority 1 = 60, priority 5 = 20)
  const priorityScore = (6 - priorityWeight) * 12;

  // Add confidence bonus (0-20)
  const confidence = (insight.metadata?.confidence as number) ?? 0.5;
  const confidenceBonus = confidence * 20;

  // Add stroke impact bonus (0-20)
  const strokeImpact = (insight.metadata?.stroke_impact as number) ?? 0;
  const strokeImpactBonus = Math.min(strokeImpact * 5, 20);

  // Apply sensitivity adjustment
  const sensitivityMultiplier =
    philosophy.alertSensitivity === 'aggressive' ? 1.1 :
    philosophy.alertSensitivity === 'conservative' ? 0.9 : 1.0;

  // Calculate final score, clamped to 0-100
  const rawScore = (priorityScore + confidenceBonus + strokeImpactBonus) * sensitivityMultiplier;
  return Math.min(100, Math.max(0, Math.round(rawScore)));
}
/**
 * Weights and ranks insights based on coach philosophy settings
 * Returns insights sorted by philosophy score (highest first)
 */
export function weightInsightsByPhilosophy(
  insights: InsightRecord[],
  philosophy: CoachPhilosophy
): WeightedInsight[] {
  // Get the top priority category (lowest number = highest priority)
  const priorities = [
    { category: 'ball_striking' as const, weight: philosophy.priorityBallStriking },
    { category: 'short_game' as const, weight: philosophy.priorityShortGame },
    { category: 'putting' as const, weight: philosophy.priorityPutting },
    { category: 'course_management' as const, weight: philosophy.priorityCourseManagement },
    { category: 'mental_game' as const, weight: philosophy.priorityMentalGame },
  ];

  const topPriorityCategory = priorities.reduce((a, b) =>
    a.weight < b.weight ? a : b
  ).category;

  // Weight each insight
  const weightedInsights: WeightedInsight[] = insights.map(insight => {
    const category = categorizeInsight(insight);
    const philosophyScore = calculatePhilosophyScore(insight, category, philosophy);
    const matchesCoachPriority = category === topPriorityCategory;

    // Normalize stroke impact for comparison
    const strokeImpact = (insight.metadata?.stroke_impact as number) ?? 0;
    const strokeImpactScore = Math.min(100, strokeImpact * 20);

    return {
      ...insight,
      philosophyScore,
      matchesCoachPriority,
      priorityCategory: category,
      strokeImpactScore,
    };
  });

  // Sort by philosophy score (highest first)
  return weightedInsights.sort((a, b) => b.philosophyScore - a.philosophyScore);
}
// ============================================================================
// AUTH HELPERS - Player/Team Access Verification
// ============================================================================

/**
 * Verifies that the current user has access to a specific player's data.
 *
 * Thin wrapper over `@/lib/auth/verify-player-access` that preserves this
 * file's legacy return shape (`authorized`, `userId`, `coachId`, `teamId`,
 * `error`) so the six call sites below don't need to change.
 *
 * Access is granted if:
 *   1. The user IS the player (self-access), OR
 *   2. The user is a coach staffing ANY team the player belongs to
 *      (multi-team-safe via the shared `verifyPlayerAccess` helper).
 *
 * The old duplicated body used `.limit(1)` on the coach's org teams, which
 * silently denied multi-team coaches. The shared helper uses an RPC that
 * joins `golf_team_coach_staff` correctly.
 */
export async function verifyPlayerAccessForInsights(
  playerId: string
): Promise<{
  authorized: boolean;
  userId?: string;
  coachId?: string;
  /**
   * Security review follow-up (PR #1980): best-effort enrichment only. It
   * becomes `undefined` on a query error in either branch above (self:
   * `.maybeSingle()` error is swallowed by optional chaining; coach:
   * `membershipError`/`staffError` are logged but still fall through to
   * `undefined`) as well as on a genuine "no matching team" result. An
   * `undefined` teamId must never be treated as "no team scoping needed" —
   * callers that use `access.teamId` to scope a write (see `.eq('team_id',
   * access.teamId)` call sites below) must re-verify access/ownership
   * rather than trusting this value to authorize or scope a mutation.
   */
  teamId?: string;
  error?: string;
}> {
  const shared = getStatsActionContext();
  const matchingShared = shared?.requestedPlayerId === playerId ? shared : undefined;
  const supabase = matchingShared?.supabase ?? (await createClient());
  const user = matchingShared?.user ?? (await supabase.auth.getUser()).data.user;
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  const access =
    matchingShared?.authorization ??
    (await sharedVerifyPlayerAccess(playerId, user.id, supabase));
  if (!access.allowed) {
    return { authorized: false, error: 'Not authorized to access this player' };
  }

  // Preserve the legacy return shape by supplementing coachId / teamId.
  if (access.reason === 'self') {
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    return { authorized: true, userId: user.id, teamId: membership?.team_id ?? undefined };
  }

  // Coach branch — look up coach id + team id. Prefer a team the coach staffs
  // that the player is an active member of (multi-team-safe).
  //
  // #1571 follow-up: `access.coachId` was always undefined before that fix,
  // so this branch never actually ran in production. The embed below --
  // `golf_team_coach_staff.select('team_id, golf_team_members!inner(...))` --
  // has no real foreign key between those two tables (both reference
  // `golf_teams` independently), so PostgREST would refuse it. Resolved with
  // two plain queries instead: the player's active team memberships, then
  // which of those the coach staffs.
  const coachId = access.coachId;

  let teamId: string | undefined;
  if (coachId) {
    const { data: memberships, error: membershipError } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .eq('status', 'active');
    if (membershipError) {
      await logServerError(`verifyPlayerAccess.teamId membership lookup failed: ${describeError(membershipError)}`, {
        action: 'insights.verifyPlayerAccess.teamId',
        featureArea: 'insights',
        metadata: { playerId, coachId },
      });
    }
    const teamIds = (memberships ?? [])
      .map((m) => m.team_id)
      .filter((id): id is string => !!id);
    if (teamIds.length > 0) {
      const { data: staffedTeam, error: staffError } = await supabase
        .from('golf_team_coach_staff')
        .select('team_id')
        .eq('coach_id', coachId)
        .in('team_id', teamIds)
        .limit(1)
        .maybeSingle();
      if (staffError) {
        await logServerError(`verifyPlayerAccess.teamId staff lookup failed: ${describeError(staffError)}`, {
          action: 'insights.verifyPlayerAccess.teamId',
          featureArea: 'insights',
          metadata: { playerId, coachId },
        });
      }
      teamId = staffedTeam?.team_id ?? undefined;
    }
  }

  return { authorized: true, userId: user.id, coachId, teamId };
}
/**
 * Converts V2 ComposedInsight to V1 InsightRecord format for database storage
 */
export function convertV2ToInsightRecord(
  insight: ComposedInsight,
  playerId: string,
  coachId: string,
  teamId: string,
  pattern?: MinedPattern,
  prediction?: PerformancePrediction
): InsightRecord {
  const insightType = determineInsightType(insight, pattern, prediction);
  const priority = mapToneToPriority(insight.tone, insight.confidence);

  return {
    coach_id: coachId,
    team_id: teamId,
    insight_type: insightType,
    priority,
    player_id: playerId,
    title: insight.headline,
    content: insight.body,  // DB column is 'content'
    metadata: {
      confidence: insight.confidence,
      tone: insight.tone,
      recommendation: insight.callToAction || 'Review this insight with your coach.',
      reasoning_steps: insight.reasoning?.reasoningChain?.length ?? 0,
      v2_engine: true,
      pattern_id: pattern?.id,
      sample_n: pattern?.sampleSize ?? pattern?.occurrenceCount,
      stroke_impact: insight.strokeImpact ?? pattern?.strokeImpact,
      prediction_value: prediction?.predictedValue,
    },
    status: 'active',
  };
}
// ============================================================================
// GET PLAYER COACHHELM DASHBOARD DATA
// ============================================================================

export interface PlayerCoachHelmDashboardData {
  playerId: string;
  playerName: string;
  lastUpdated: string;

  // Performance prediction
  prediction: PerformancePrediction | null;

  // Active insights
  insights: ComposedInsight[];

  // Focus areas with strokes gained context.
  // P2-18: `strokesGained` is kept as the internal ordering magnitude (back-compat
  // contract), but ONLY stroke-impact-derived rows may be LABELLED strokes/round.
  // `value` + `unit` carry each row's NATIVE quantity so the UI never presents a
  // distance error or a causal effect-size as "strokes/round".
  focusAreas: Array<{
    area: string;
    strokesGained: number;
    /** Display magnitude in the row's native unit (defaults to strokesGained). */
    value?: number;
    /** Native unit for `value`. Only 'strokes/round' traces to strokes_impact. */
    unit?: 'strokes/round' | 'yd from target' | 'opportunity';
    trend: 'improving' | 'stable' | 'declining';
    recommendation: string;
  }>;

  // Recent rounds for review
  recentRounds: Array<{
    id: string;
    courseName: string;
    date: string;
    score: number;
    scoreToPar: number;
    hasReview: boolean;
  }>;

  // Player state for UI customization
  playerState: 'improving' | 'stable' | 'struggling' | 'unknown';
  alertLevel: 'none' | 'info' | 'warning' | 'critical';
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Build focus areas from analysis data */
export function buildFocusAreasFromAnalysis(analysis: PlayerAnalysis | null): PlayerCoachHelmDashboardData['focusAreas'] {
  if (!analysis) return [];

  const focusAreas: PlayerCoachHelmDashboardData['focusAreas'] = [];

  // Add focus areas from patterns
  const activePatterns = analysis.patterns?.filter(p => p.isActive && p.strokeImpact > 0.3) || [];
  for (const pattern of activePatterns.slice(0, 3)) {
    const condition = pattern.conditions[0];
    const areaName = condition?.label || condition?.field || 'General';

    // Avoid duplicates
    if (focusAreas.some(f => f.area === areaName)) continue;

    focusAreas.push({
      area: areaName,
      strokesGained: -pattern.strokeImpact, // Negative because it's costing strokes
      // P2-18: pattern.strokeImpact IS a per-round stroke impact, so this row may
      // honestly be labelled strokes/round.
      unit: 'strokes/round',
      trend: pattern.trend === 'strengthening' ? 'declining' :
             pattern.trend === 'weakening' ? 'improving' : 'stable',
      recommendation: pattern.recommendation || 'Focus on improving this area.',
    });
  }

  // Add focus areas from shot patterns
  if (analysis.shotPatterns?.criticalPatterns) {
    for (const shotPattern of analysis.shotPatterns.criticalPatterns.slice(0, 2)) {
      const areaName = `${shotPattern.situation.distanceRange.label} Shots`;

      if (focusAreas.some(f => f.area === areaName)) continue;

      focusAreas.push({
        area: areaName,
        // P2-18: avgDistanceError is YARDS from target, NOT strokes/round. The
        // legacy `/10` was a fabricated stroke conversion. Keep a small negative
        // strokesGained ONLY for internal ordering, but surface the row's NATIVE
        // value+unit (yards) so the UI never mislabels it as strokes/round.
        strokesGained: -(shotPattern.avgDistanceError / 10),
        value: shotPattern.avgDistanceError,
        unit: 'yd from target',
        trend: 'stable',
        recommendation: shotPattern.recommendation,
      });
    }
  }

  // Add focus areas from causal relationships
  for (const causal of (analysis.causalRelationships || []).slice(0, 2)) {
    if (causal.interventionPotential > 0.6) {
      const areaName = causal.cause;

      if (focusAreas.some(f => f.area === areaName)) continue;

      focusAreas.push({
        area: areaName,
        // P2-18: causal.strength is a unitless effect size (0-1), NOT strokes.
        // Keep it negative for ordering, but mark it a qualitative opportunity so
        // the UI shows an "opportunity" tier rather than a fake strokes/round value.
        strokesGained: -causal.strength,
        value: causal.strength,
        unit: 'opportunity',
        trend: 'stable',
        recommendation: `Improving ${causal.cause} could positively impact ${causal.effect}.`,
      });
    }
  }

  return focusAreas.slice(0, 5); // Return top 5 focus areas
}
