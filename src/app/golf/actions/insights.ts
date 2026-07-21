'use server';

// ============================================================================
// COACHHELM INSIGHT GENERATION - SERVER ACTIONS
// ============================================================================
//
// Single source of truth for all CoachHelm AI insight generation.
// Powered by the CoachHelm Intelligence Engine.
//
// Features:
//   - Pattern mining with statistical validation
//   - Causal relationship discovery
//   - Performance predictions with confidence calibration
//   - Shot-level pattern analysis
//   - Composed insights with reasoning chains
//   - Behavior learning from user interactions
//
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { verifyInsightAccess } from '@/lib/auth/verify-player-access';
import {
  coachHelmIntelligence,
  isCoachHelmEnabledForCoach,
  isCoachHelmEnabledForPlayer,
} from '@/lib/coachhelm/v2';
import type {
  ComposedInsight,
  MinedPattern,
  PerformancePrediction,
  PlayerAnalysis,
  TeamComposedInsight,
  InsightCategory,
  InsightGroup,
  InsightTone,
} from '@/lib/coachhelm/v2/types';
import type { InsightType, InsightPriority } from '@/lib/coachhelm/insight-types';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';
import { PHILOSOPHY_DEFAULTS } from '@/lib/coachhelm/constants';
import { generateTeamPatterns } from '@/lib/coachhelm/v2/mining/team-pattern-generator';
import { generateTeamForecasts } from '@/lib/coachhelm/v2/prediction/team-forecaster';
import type { PhilosophyGate } from '@/lib/coachhelm/v2/insights/gate-context';
import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import { loadAlertPostureForPlayer } from '@/lib/coachhelm/v3/intent/loader';
import { toInsightInput } from '@/lib/coachhelm/v2/insights/to-insight-input';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { loadCoachWeightsForPlayer, rankInsights } from '@/lib/coachhelm/v3/ranking/score';
import { loadActiveGoals } from '@/lib/coachhelm/v3/goals/loader';
import { verifyPlayerAccess as sharedVerifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { checkRateLimit } from '@/lib/auth/supabase-rate-limit';
import { recordInsightAction } from '@/lib/coachhelm/v3/effectiveness/event-ledger';

// 2026-05-23: All user-callable CoachHelm engine entrypoints rate-limit at
// 5/min/user — the engine runs are multi-second jobs that load shots, mine
// patterns, predict, and write multiple tables. Without this, an authenticated
// coach can hold a function instance hostage with a tight loop across the
// roster. Audit finding P0-11.
const COACHHELM_ENGINE_RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 60 * 1000,
} as const;

async function gateCoachHelmEngineCall(userId: string | undefined): Promise<{ allowed: true } | { allowed: false; error: string }> {
  if (!userId) return { allowed: true }; // pre-auth callers already rejected upstream
  const rl = await checkRateLimit(`coachhelm:engine:${userId}`, COACHHELM_ENGINE_RATE_LIMIT);
  if (!rl.allowed) {
    return { allowed: false, error: 'Too many analyze requests in the last minute — please wait a moment and try again.' };
  }
  return { allowed: true };
}
import { getGolfSessionProfile } from '@/lib/auth/session';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { __registerTriggerPlayerInsightsAfterRound } from '@/lib/coachhelm/v2/trigger-insights-bridge';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';

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

interface InsightRecord {
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

interface TeamPlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface PlayerStatsCacheRow {
  player_id: string;
  rounds_in_calculation: number | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
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
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Fetches coach philosophy from database, returns defaults if not found
 */
async function getCoachPhilosophy(
  coachId: string,
  client?: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>
): Promise<CoachPhilosophy> {
  const supabase = client ?? await createClient();

  // Resilient: a thrown query (transient DB error, etc.) must NOT propagate —
  // every caller can safely operate on the defaults below, so swallow the
  // throw to null and fall through to the `if (!data)` default path.
  let data: unknown = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (supabase as any)
      .from('golf_coach_philosophy')
      .select('*')
      .eq('coach_id', coachId)
      .maybeSingle();
    data = res?.data ?? null;
  } catch (philErr) {
    await logServerError(
      `getCoachPhilosophy query failed (using defaults): ${philErr instanceof Error ? philErr.message : String(philErr)}`,
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
    createdAt: row.created_at ?? defaults.createdAt,
    updatedAt: row.updated_at ?? defaults.updatedAt,
  };
}

/**
 * Filters insights based on coach philosophy alert toggles
 */
function shouldIncludeInsight(insightType: InsightType, philosophy: CoachPhilosophy): boolean {
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

/**
 * Gets the minimum confidence threshold based on alert sensitivity
 */
function getConfidenceThreshold(sensitivity: CoachPhilosophy['alertSensitivity']): number {
  switch (sensitivity) {
    case 'aggressive':
      return 0.4; // Show more insights
    case 'conservative':
      return 0.7; // Only high confidence insights
    case 'balanced':
    default:
      return 0.55;
  }
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
function weightInsightsByPhilosophy(
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

/**
 * Gets insights matching coach's top priorities
 * Returns only insights from the top 2 priority categories
 */
/**
 * Gets insights sorted by stroke impact (highest first)
 * For the "Top Insights by Stroke Impact" section
 */
async function getTopInsightsByStrokeImpactImpl(
  weightedInsights: WeightedInsight[],
  limit: number = 5
): Promise<WeightedInsight[]> {
  return [...weightedInsights]
    .sort((a, b) => b.strokeImpactScore - a.strokeImpactScore)
    .slice(0, limit);
}

const observedGetTopInsightsByStrokeImpact = withAdminObserved(
  'getTopInsightsByStrokeImpact',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getTopInsightsByStrokeImpactImpl,
);
export async function getTopInsightsByStrokeImpact(
  weightedInsights: WeightedInsight[],
  limit: number = 5
): Promise<WeightedInsight[]> {
  return observedGetTopInsightsByStrokeImpact(weightedInsights, limit);
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
async function verifyPlayerAccess(
  playerId: string
): Promise<{ authorized: boolean; userId?: string; coachId?: string; teamId?: string; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  const access = await sharedVerifyPlayerAccess(playerId, user.id, supabase);
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
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  let teamId: string | undefined;
  if (coach?.id) {
    const { data: staffedTeam } = await supabase
      .from('golf_team_coach_staff')
      .select('team_id, golf_team_members!inner(player_id, status)')
      .eq('coach_id', coach.id)
      .eq('golf_team_members.player_id', playerId)
      .eq('golf_team_members.status', 'active')
      .limit(1)
      .maybeSingle();
    teamId = staffedTeam?.team_id ?? undefined;
  }

  return { authorized: true, userId: user.id, coachId: coach?.id, teamId };
}

/**
 * Verifies that the current user has access to a specific round.
 * Uses player ownership chain: round -> player -> user
 */
async function verifyRoundAccess(
  roundId: string
): Promise<{ authorized: boolean; userId?: string; playerId?: string; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  // Get round and verify ownership
  const { data: round } = await supabase
    .from('golf_rounds')
    .select('player_id')
    .eq('id', roundId)
    .single();

  if (!round) {
    return { authorized: false, error: 'Round not found' };
  }

  // Check if user owns the round via player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('id', round.player_id)
    .eq('user_id', user.id)
    .single();

  if (player) {
    return { authorized: true, userId: user.id, playerId: player.id };
  }

  // Check if user is a coach STAFFED on a team the round's player belongs to.
  // Staff-scoped (was a single arbitrary org team via .limit(1), which wrongly
  // denied access to half the players in a two-team program).
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coach?.id) {
    const { data: staffRows } = await supabase
      .from('golf_team_coach_staff')
      .select('team_id')
      .eq('coach_id', coach.id);
    const staffTeamIds = (staffRows ?? []).map((r) => r.team_id).filter(Boolean) as string[];

    if (staffTeamIds.length > 0) {
      const { data: teamMember } = await supabase
        .from('golf_team_members')
        .select('id')
        .in('team_id', staffTeamIds)
        .eq('player_id', round.player_id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (teamMember) {
        return { authorized: true, userId: user.id, playerId: round.player_id };
      }
    }
  }

  return { authorized: false, error: 'Not authorized to access this round' };
}

/**
 * Converts V2 ComposedInsight to V1 InsightRecord format for database storage
 */
function convertV2ToInsightRecord(
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
// GENERATE INSIGHTS FOR TEAM (V2 Engine)
// ============================================================================

async function generateTeamInsightsImpl() {
  const supabase = await createClient();
  const startTime = Date.now();

  try {
    // 1. Get current coach
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Rate-limit the whole-roster engine sweep, same as the per-player /
    // per-round entrypoints. Without this, a coach can fan analyzePlayer out
    // across the entire roster with no throttle (self-scoped DoS vector).
    const rateLimit = await gateCoachHelmEngineCall(user.id);
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    // Get coach and look up team_id via organization
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Resolve the coach's ACTIVE team (cookie-aware; handles multi-team programs
    // and the men's/women's toggle). Falls back to the coach's primary team.
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

    if (!teamId) {
      return { success: false, error: 'No team assigned' };
    }

    // 2. Check if CoachHelm V2 is enabled for this coach
    const coachHelmStatus = await isCoachHelmEnabledForCoach(coach.id);
    if (!coachHelmStatus.effectivelyEnabled) {
      return { success: false, error: coachHelmStatus.disabledReason || 'CoachHelm is disabled' };
    }

    // 2.5. Fetch coach philosophy settings
    const philosophy = await getCoachPhilosophy(coach.id);
    const confidenceThreshold = getConfidenceThreshold(philosophy.alertSensitivity);

    // 3. Get team players via golf_team_members
    const { data: teamMembers, error: membersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (membersError || !teamMembers || teamMembers.length === 0) {
      return { success: false, error: 'No players found' };
    }

    const playerIds = teamMembers.map(m => m.player_id);
    const { data: players, error: playersError } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', playerIds);

    if (playersError || !players || players.length === 0) {
      return { success: false, error: 'No players found' };
    }

    // 4. Batch fetch existing active insights for deduplication
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingInsights } = await (supabase as any)
      .from('golf_coach_insights')
      .select('player_id, insight_type')
      .eq('coach_id', coach.id)
      .eq('status', 'active')
      .in('player_id', playerIds);

    const existingInsightKeys = new Set(
      (existingInsights || []).map(
        (i: { player_id: string; insight_type: string }) => `${i.player_id}:${i.insight_type}`
      )
    );

    // 5. Analyze each player with V2 engine (batched to avoid connection pool exhaustion)
    const BATCH_SIZE = 3;
    const analysisResults: Array<{ player: TeamPlayerRow; analysis: PlayerAnalysis | null; success: boolean }> = [];

    for (let i = 0; i < players.length; i += BATCH_SIZE) {
      const batch = players.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (player) => {
          try {
            const analysis = await coachHelmIntelligence.analyzePlayer(player.id, {
              includePatterns: true,
              includeCausal: true,
              includePredictions: true,
              includeShotPatterns: true,
              depth: 'standard',
              // F061 — honor the coach's saved Insight Detail Level in the NLG.
              verbosity: philosophy.insightVerbosity,
            });
            return { player, analysis, success: true };
          } catch (err) {
            await logServerError(`generateInsightsForTeam player analysis failed: ${err instanceof Error ? err.message : String(err)}`, {
              action: 'generateInsightsForTeam.analyzePlayer',
              featureArea: 'insights',
              playerId: player.id,
            });
            return { player, analysis: null, success: false };
          }
        })
      );
      analysisResults.push(...batchResults);
    }

    // 6. Convert V2 insights to InsightRecords
    let totalInsightsCreated = 0;
    const allInsights: InsightRecord[] = [];

    for (const result of analysisResults) {
      if (!result.success || !result.analysis) continue;

      const { player, analysis } = result;

      // Convert each V2 insight
      for (let i = 0; i < analysis.insights.length; i++) {
        const insight = analysis.insights[i];
        if (!insight) continue;  // Skip if undefined

        // Apply philosophy-based confidence filter
        if (insight.confidence < confidenceThreshold) continue;

        const pattern = analysis.patterns[i]; // May be undefined
        const prediction = analysis.predictions[0]; // Use first prediction

        const record = convertV2ToInsightRecord(
          insight,
          player.id,
          coach.id,
          teamId,
          pattern,
          prediction
        );

        // Apply philosophy-based alert type filter
        if (!shouldIncludeInsight(record.insight_type as InsightType, philosophy)) continue;

        // Check for duplicates
        const insightKey = `${player.id}:${record.insight_type}`;
        if (!existingInsightKeys.has(insightKey)) {
          allInsights.push(record);
          existingInsightKeys.add(insightKey);
          totalInsightsCreated++;
        }
      }

      // Also add pattern-specific insights if high impact
      // Skip if recurring_weakness alerts are disabled
      if (shouldIncludeInsight('recurring_weakness', philosophy)) {
        for (const pattern of analysis.patterns.filter(p => p.isActive && p.strokeImpact > 1)) {
          // Apply philosophy-based confidence filter to patterns
          if (pattern.confidence < confidenceThreshold) continue;

          const patternInsight: InsightRecord = {
            coach_id: coach.id,
            team_id: teamId,
            insight_type: 'pattern_detected',  // maps to allowed DB type
            priority: Number(pattern.strokeImpact ?? 0) > 2 ? 'high' : 'medium',
            player_id: player.id,
            title: `Pattern: ${pattern.description || 'Performance Pattern'}`,
            content: pattern.recommendation || `Pattern detected with ${(Number(pattern.confidence ?? 0) * 100).toFixed(0)}% confidence.`,
            metadata: {
              v2_engine: true,
              pattern_type: pattern.patternType,
              support: pattern.support,
              sample_n: pattern.sampleSize ?? pattern.occurrenceCount,
              occurrence_count: pattern.occurrenceCount,
              confidence: pattern.confidence,
              stroke_impact: pattern.strokeImpact,
              recommendation: pattern.recommendation || 'Work with coach to address this pattern.',
            },
            status: 'active',
          };

          const patternKey = `${player.id}:${patternInsight.insight_type}:${pattern.id}`;
          if (!existingInsightKeys.has(patternKey)) {
            allInsights.push(patternInsight);
            existingInsightKeys.add(patternKey);
            totalInsightsCreated++;
          }
        }
      }
    }

    // 6.25. Generate team-wide cross-player pattern insights
    try {
      const teamPatternInsights = await coachHelmIntelligence.generateTeamPatternInsights(teamId);
      for (const tpi of teamPatternInsights) {
        const record: InsightRecord = {
          coach_id: coach.id,
          team_id: teamId,
          insight_type: 'team_trend',
          priority: tpi.tone === 'urgent' ? 'high' : tpi.tone === 'cautionary' ? 'medium' : 'low',
          player_id: null,
          title: tpi.headline,
          content: tpi.body,
          metadata: {
            v2_engine: true,
            cross_player: true,
            confidence: tpi.confidence,
            sample_n: players.length,
            stroke_impact: tpi.strokeImpact,
            recommendation: tpi.callToAction || 'Review team-wide pattern.',
            reasoning_steps: tpi.reasoning?.reasoningChain?.length ?? 0,
          },
          status: 'active',
        };

        const teamKey = `team:${record.insight_type}:${tpi.headline}`;
        if (!existingInsightKeys.has(teamKey)) {
          allInsights.push(record);
          existingInsightKeys.add(teamKey);
          totalInsightsCreated++;
        }
      }
    } catch (err) {
      await logServerError(`generateInsightsForTeam team pattern insights failed: ${err instanceof Error ? err.message : String(err)}`, {
        action: 'generateInsightsForTeam.teamPatterns',
        featureArea: 'insights',
      });
    }

    // 6.5. Apply philosophy weighting to sort and enhance insights
    const weightedInsights = weightInsightsByPhilosophy(allInsights, philosophy);

    // Enhance insights with philosophy metadata before insertion
    const insightsWithPhilosophy = weightedInsights.map(insight => ({
      ...insight,
      metadata: {
        ...insight.metadata,
        philosophy_score: insight.philosophyScore,
        matches_coach_priority: insight.matchesCoachPriority,
        priority_category: insight.priorityCategory,
        stroke_impact_score: insight.strokeImpactScore,
      },
      // Remove the extended properties that aren't part of the DB schema
      philosophyScore: undefined,
      matchesCoachPriority: undefined,
      priorityCategory: undefined,
      strokeImpactScore: undefined,
    }));

    // Clean up undefined properties
    const cleanInsights: InsightRecord[] = insightsWithPhilosophy.map(insight => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { philosophyScore, matchesCoachPriority, priorityCategory, strokeImpactScore, ...cleanInsight } = insight;
      return cleanInsight as InsightRecord;
    });

    // 7. Persist insights through the evidence-backed upsert contract.
    if (cleanInsights.length > 0) {
      try {
        const inputs = cleanInsights
          .map((record) => ({ record, input: toInsightInput(record) }))
          .filter((x): x is { record: typeof cleanInsights[number]; input: NonNullable<ReturnType<typeof toInsightInput>> } => x.input !== null);

        // 2026-05-17: toInsightInput now returns null when the legacy record
        // lacks enough sample_n (audit Q-NEW-1). Log + skip rather than throw.
        // Console-only — this fires per call and was generating ~18 Sentry
        // events/day on operational telemetry, not real errors.
        const skipped = cleanInsights.length - inputs.length;
        if (skipped > 0) {
          console.warn(
            `[insights.generateInsightsForTeam] skipped ${skipped} legacy records with insufficient sample_n`,
          );
        }
        await Promise.all(inputs.map(({ input }) => upsertInsight(supabase, input)));
      } catch (insertError) {
        await logServerError(`generateInsightsForTeam upsert failed: ${insertError instanceof Error ? insertError.message : String(insertError)}`, {
          action: 'generateInsightsForTeam.insert',
          featureArea: 'insights',
          extra: { insightCount: cleanInsights.length },
        });
        return { success: false, error: 'Failed to save insights' };
      }
    }

    // 8. Log generation
    const executionTime = Date.now() - startTime;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('golf_insight_generation_log').insert({
      team_id: teamId,
      insight_type: 'v2_consolidated',
      insights_generated: totalInsightsCreated,
      rounds_analyzed: players.length,
      engine_version: 'v2',
      duration_ms: executionTime,
    });

    // 9. Revalidate dashboard + the insights page itself (C2/F112 — these
    // newly-generated rows surface on /golf/dashboard/insights, which was never
    // revalidated, so the coach saw a stale list until a full reload).
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/insights');
    // Defense-in-depth: /insights is a permanent-redirect shim onto the coach
    // Intelligence home's Signals drill (2026-07-19, plan Task 9) — revalidate
    // the canonical destination too (pattern: v3/goals.ts createTeamGoal).
    revalidatePath('/golf/dashboard/intelligence');

    return {
      success: true,
      insights_created: totalInsightsCreated,
      players_analyzed: players.length,
      execution_time_ms: executionTime,
    };
  } catch (error) {
    await logServerError(`generateInsightsForTeam failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'generateInsightsForTeam',
      featureArea: 'insights',
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGenerateTeamInsights = withAdminObserved(
  'generateTeamInsights',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  generateTeamInsightsImpl,
);
export async function generateTeamInsights() {
  return observedGenerateTeamInsights();
}

// ============================================================================
// GET ACTIVE INSIGHTS FOR COACH
// ============================================================================

async function getActiveInsightsImpl(limit: number = 10) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated', insights: [] };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found', insights: [] };
    }

    // Apply the SAME shared product-visibility contract (P2 orphan): even
    // though this action currently has no live caller, if it is ever re-wired
    // it must not return stale v2 phantoms or archived/tentative rows. The
    // helper adds the v3-engine + visible-lifecycle + not-dismissed guards on
    // top of the existing coach + status='active' scope.
    const { data: insights, error } = await applyInsightVisibility(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_coach_insights')
        .select(
          `
        *,
        player:golf_players(id, first_name, last_name, avatar_url)
      `
        )
        .eq('coach_id', coach.id)
        .eq('status', 'active'),
    )
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      await logServerError(`getActiveInsights query failed: ${error.message}`, {
        action: 'getActiveInsights',
        featureArea: 'insights',
        extra: { errorCode: error.code },
      });
      return { success: false, error: 'Failed to generate insights. Please try again.', insights: [] };
    }

    return { success: true, insights: insights || [] };
  } catch (error) {
    await logServerError(`getActiveInsights failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getActiveInsights',
      featureArea: 'insights',
    });
    return { success: false, error: 'An unexpected error occurred', insights: [] };
  }
}

const observedGetActiveInsights = withAdminObserved(
  'getActiveInsights',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getActiveInsightsImpl,
);
export async function getActiveInsights(limit: number = 10) {
  return observedGetActiveInsights(limit);
}

// ============================================================================
// ACKNOWLEDGE INSIGHT
// ============================================================================

async function acknowledgeInsightImpl(insightId: string) {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Defensive server-side ownership check on top of RLS. Resolves the
    // insight's team_id and confirms the user staffs that team via
    // golf_team_coach_staff. Multi-org safe (does NOT pick an arbitrary
    // coach row by user_id).
    const access = await verifyInsightAccess(insightId, user.id, supabase);
    if (!access.allowed) {
      return { success: false, error: access.reason === 'not-found' ? 'Insight not found' : 'Not authorized' };
    }

    // Write lifecycle_state='addressed' alongside the timestamp so the
    // lifecycle cron can pick it up for the addressed→resolved progression.
    // Without this, acknowledged insights sit in 'detected'/'matured' forever
    // and the cron's healthy-band tracking can never run.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
        lifecycle_state: 'addressed',
      })
      .eq('id', insightId)
      .eq('team_id', access.teamId)
      .select('id, player_id');

    if (error) {
      await logServerError(`acknowledgeInsight failed: ${error.message}`, {
        action: 'acknowledgeInsight',
        featureArea: 'insights',
        extra: { insightId, errorCode: error.code },
      });
      return { success: false, error: 'Operation failed. Please try again.' };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Insight not found' };
    }

    // P1-12: record the ACK as a real insight action (failure-silent). Only a
    // confirmed update of an authorized row reaches here, so "not-acted can't
    // be acted" holds. player_id comes from the updated row.
    const ackPlayerId = (data[0] as { player_id?: string | null } | undefined)?.player_id;
    if (ackPlayerId) {
      void recordInsightAction({
        insight_id: insightId,
        player_id: ackPlayerId,
        actor_id: user.id,
        actor_role: 'coach',
        action_type: 'acknowledged',
      });
    }

    revalidatePath('/golf/dashboard');
    // C2/F112 — the insights list page is its own route; revalidate it so the
    // acknowledged row updates without a hard reload.
    revalidatePath('/golf/dashboard/insights');
    // Defense-in-depth: /insights is a permanent-redirect shim onto the coach
    // Intelligence home's Signals drill (2026-07-19, plan Task 9).
    revalidatePath('/golf/dashboard/intelligence');
    return { success: true };
  } catch (error) {
    await logServerError(`acknowledgeInsight failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'acknowledgeInsight',
      featureArea: 'insights',
      extra: { insightId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedAcknowledgeInsight = withAdminObserved(
  'acknowledgeInsight',
  { sport: 'golf', feature: 'insights_management' },
  acknowledgeInsightImpl,
);
export async function acknowledgeInsight(insightId: string) {
  return observedAcknowledgeInsight(insightId);
}

// ============================================================================
// DISMISS INSIGHT
// ============================================================================

async function dismissInsightImpl(insightId: string) {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Defensive server-side ownership check on top of RLS.
    const access = await verifyInsightAccess(insightId, user.id, supabase);
    if (!access.allowed) {
      return { success: false, error: access.reason === 'not-found' ? 'Insight not found' : 'Not authorized' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        status: 'dismissed',
        dismissed: true,
        dismissed_at: new Date().toISOString(),
        lifecycle_state: 'archived',
      })
      .eq('id', insightId)
      .eq('team_id', access.teamId)
      .select('id, player_id');

    if (error) {
      await logServerError(`dismissInsight failed: ${error.message}`, {
        action: 'dismissInsight',
        featureArea: 'insights',
        extra: { insightId, errorCode: error.code },
      });
      return { success: false, error: 'Operation failed. Please try again.' };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Insight not found' };
    }

    // P1-12: record the DISMISS as a real insight action (failure-silent).
    const dismissPlayerId = (data[0] as { player_id?: string | null } | undefined)?.player_id;
    if (dismissPlayerId) {
      void recordInsightAction({
        insight_id: insightId,
        player_id: dismissPlayerId,
        actor_id: user.id,
        actor_role: 'coach',
        action_type: 'dismissed',
      });
    }

    revalidatePath('/golf/dashboard');
    // C2/F112 — revalidate the insights list route so the dismissed row drops.
    revalidatePath('/golf/dashboard/insights');
    // Defense-in-depth: /insights is a permanent-redirect shim onto the coach
    // Intelligence home's Signals drill (2026-07-19, plan Task 9).
    revalidatePath('/golf/dashboard/intelligence');
    return { success: true };
  } catch (error) {
    await logServerError(`dismissInsight failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'dismissInsight',
      featureArea: 'insights',
      extra: { insightId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedDismissInsight = withAdminObserved(
  'dismissInsight',
  { sport: 'golf', feature: 'insights_management' },
  dismissInsightImpl,
);
export async function dismissInsight(insightId: string) {
  return observedDismissInsight(insightId);
}

// ============================================================================
// REACTIVATE INSIGHT (undo for acknowledge / dismiss)
// ============================================================================

/**
 * P030 — the truthful reverse of `acknowledgeInsight` / `dismissInsight`, so a
 * per-row triage toast can offer a real Undo (Nielsen #3) that actually
 * restores the row server-side, not just in the UI. Sets the coach axis back to
 * `status='active'`, clears the acknowledge/dismiss stamps, and restores the
 * engine lifecycle axis to the row's prior visible state (passed by the caller
 * from its optimistic snapshot — defaults to 'detected', a visible state, so the
 * row reappears in the canonical V3 feed). Same auth + ownership boundary as the
 * forward actions. Additive — no existing action's contract changes.
 */
async function reactivateInsightImpl(
  insightId: string,
  priorLifecycleState?: 'detected' | 'matured' | 'addressed' | 'resolved',
) {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const access = await verifyInsightAccess(insightId, user.id, supabase);
    if (!access.allowed) {
      return { success: false, error: access.reason === 'not-found' ? 'Insight not found' : 'Not authorized' };
    }

    // Restore to a VISIBLE lifecycle state so the row returns to the feed; never
    // leave it 'archived'/'tentative' (the visibility filter would hide it).
    const lifecycle = priorLifecycleState ?? 'detected';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        status: 'active',
        acknowledged_at: null,
        dismissed: false,
        dismissed_at: null,
        lifecycle_state: lifecycle,
      })
      .eq('id', insightId)
      .eq('team_id', access.teamId)
      .select('id');

    if (error) {
      await logServerError(`reactivateInsight failed: ${error.message}`, {
        action: 'reactivateInsight',
        featureArea: 'insights',
        extra: { insightId, errorCode: error.code },
      });
      return { success: false, error: 'Operation failed. Please try again.' };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Insight not found' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/insights');
    // Defense-in-depth: /insights is a permanent-redirect shim onto the coach
    // Intelligence home's Signals drill (2026-07-19, plan Task 9).
    revalidatePath('/golf/dashboard/intelligence');
    return { success: true };
  } catch (error) {
    await logServerError(`reactivateInsight failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'reactivateInsight',
      featureArea: 'insights',
      extra: { insightId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedReactivateInsight = withAdminObserved(
  'reactivateInsight',
  { sport: 'golf', feature: 'insights_management' },
  reactivateInsightImpl,
);
export async function reactivateInsight(
  insightId: string,
  priorLifecycleState?: 'detected' | 'matured' | 'addressed' | 'resolved',
) {
  return observedReactivateInsight(insightId, priorLifecycleState);
}

// ============================================================================
// RESOLVE INSIGHT
// ============================================================================

async function resolveInsightImpl(insightId: string) {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Defensive server-side ownership check on top of RLS.
    const access = await verifyInsightAccess(insightId, user.id, supabase);
    if (!access.allowed) {
      return { success: false, error: access.reason === 'not-found' ? 'Insight not found' : 'Not authorized' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        lifecycle_state: 'resolved',
      })
      .eq('id', insightId)
      .eq('team_id', access.teamId)
      .select('id, player_id');

    if (error) {
      await logServerError(`resolveInsight failed: ${error.message}`, {
        action: 'resolveInsight',
        featureArea: 'insights',
        extra: { insightId, errorCode: error.code },
      });
      return { success: false, error: 'Operation failed. Please try again.' };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Insight not found' };
    }

    // P1-12: record the RESOLVE as a real insight action (failure-silent).
    const resolvePlayerId = (data[0] as { player_id?: string | null } | undefined)?.player_id;
    if (resolvePlayerId) {
      void recordInsightAction({
        insight_id: insightId,
        player_id: resolvePlayerId,
        actor_id: user.id,
        actor_role: 'coach',
        action_type: 'resolved',
      });
    }

    revalidatePath('/golf/dashboard');
    // C2/F112 — revalidate the insights list route so the resolved row updates.
    revalidatePath('/golf/dashboard/insights');
    // Defense-in-depth: /insights is a permanent-redirect shim onto the coach
    // Intelligence home's Signals drill (2026-07-19, plan Task 9).
    revalidatePath('/golf/dashboard/intelligence');
    return { success: true };
  } catch (error) {
    await logServerError(`resolveInsight failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'resolveInsight',
      featureArea: 'insights',
      extra: { insightId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedResolveInsight = withAdminObserved(
  'resolveInsight',
  { sport: 'golf', feature: 'insights_management' },
  resolveInsightImpl,
);
export async function resolveInsight(insightId: string) {
  return observedResolveInsight(insightId);
}

// ============================================================================
// RATE INSIGHT (feedback mechanism)
// ============================================================================

/**
 * Allows coaches to rate an insight as helpful or not helpful.
 * Feeds the rating back to the behavior learner to improve future insights.
 */
async function rateInsightImpl(
  insightId: string,
  rating: 'helpful' | 'not_helpful' | 'actionable'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Get the insight to record its type/tone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: insight } = await (supabase as any)
      .from('golf_coach_insights')
      .select('id, insight_type, priority, metadata')
      .eq('id', insightId)
      .eq('coach_id', coach.id)
      .single();

    if (!insight) {
      return { success: false, error: 'Insight not found' };
    }

    // Update the insight metadata with the rating
    const existingMetadata = (insight.metadata as Record<string, unknown>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        metadata: {
          ...existingMetadata,
          coach_rating: rating,
          rated_at: new Date().toISOString(),
        },
      })
      .eq('id', insightId);

    if (updateError) {
      return { success: false, error: 'Failed to save rating' };
    }

    // Record interaction for the behavior learner
    try {
      await recordInteraction(coach.id, 'coach', 'feedback', `insight_${rating}`, {
        insightId,
        insightType: insight.insight_type,
        priority: insight.priority,
        rating,
      });
    } catch (err) {
      // Non-critical - don't fail the operation
      await logServerError(`rateInsight interaction recording failed: ${err instanceof Error ? err.message : String(err)}`, {
        action: 'rateInsight.recordInteraction',
        featureArea: 'insights',
        extra: { insightId },
      }, 'warning');
    }

    return { success: true };
  } catch (error) {
    await logServerError(`rateInsight failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'rateInsight',
      featureArea: 'insights',
      extra: { insightId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedRateInsight = withAdminObserved(
  'rateInsight',
  { sport: 'golf', feature: 'insights_management' },
  rateInsightImpl,
);
export async function rateInsight(
  insightId: string,
  rating: 'helpful' | 'not_helpful' | 'actionable'
): Promise<{ success: boolean; error?: string }> {
  return observedRateInsight(insightId, rating);
}

// ============================================================================
// GET PLAYER FOCUS AREAS
// ============================================================================

async function getPlayerFocusAreasImpl(playerId: string) {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated', focus_areas: [] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: focusAreas, error } = await (supabase as any)
      .from('golf_player_focus_areas')
      .select('*')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .order('priority', { ascending: true });

    if (error) {
      // PGRST116 = no rows, 42501 = RLS permission denied - both are expected for players without focus areas
      // Return empty array instead of error to show graceful empty state
      maybeCaptureRlsDenial(error, {
        table: 'golf_player_focus_areas',
        verb: 'select',
        action: 'getPlayerFocusAreas',
        feature: 'my_development',
        sport: 'golf',
      });
      if (error.code === 'PGRST116' || error.code === '42501' || error.code === '42P01') {
        return { success: true, focus_areas: [] };
      }
      await logServerError(`getPlayerFocusAreas query failed: ${error.message}`, {
        action: 'getPlayerFocusAreas',
        featureArea: 'insights',
        playerId,
        extra: { errorCode: error.code },
      });
      return { success: false, error: 'Failed to get focus areas. Please try again.', focus_areas: [] };
    }

    return { success: true, focus_areas: focusAreas || [] };
  } catch (error) {
    await logServerError(`getPlayerFocusAreas failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getPlayerFocusAreas',
      featureArea: 'insights',
      playerId,
    });
    return { success: false, error: 'An unexpected error occurred', focus_areas: [] };
  }
}

const observedGetPlayerFocusAreas = withAdminObserved(
  'getPlayerFocusAreas',
  { sport: 'golf', feature: 'my_development' },
  getPlayerFocusAreasImpl,
);
export async function getPlayerFocusAreas(playerId: string) {
  return observedGetPlayerFocusAreas(playerId);
}

// ============================================================================
// ANALYZE PLAYER (Full Analysis)
// ============================================================================

async function analyzePlayerImpl(
  playerId: string,
  options?: {
    includePatterns?: boolean;
    includeCausal?: boolean;
    includePredictions?: boolean;
    includeTrajectory?: boolean;
    depth?: 'quick' | 'standard' | 'deep';
  }
): Promise<{ success: boolean; analysis?: PlayerAnalysis; error?: string }> {
  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const rateLimit = await gateCoachHelmEngineCall(access.userId);
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    // Check if CoachHelm is enabled for this player
    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    // F061 — when a coach is viewing, honor their saved Insight Detail Level.
    // For player self-views there is no single coach philosophy, so the engine
    // falls back to its balanced default (verbosity stays undefined).
    const verbosity = access.coachId
      ? (await getCoachPhilosophy(access.coachId)).insightVerbosity
      : undefined;

    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: options?.includePatterns ?? true,
      includeCausal: options?.includeCausal ?? true,
      includePredictions: options?.includePredictions ?? true,
      includeTrajectory: options?.includeTrajectory ?? false,
      depth: options?.depth ?? 'standard',
      verbosity,
    });

    if (!analysis) {
      return { success: false, error: 'Insufficient data for analysis' };
    }

    return { success: true, analysis };
  } catch (error) {
    await logServerError(`analyzePlayer failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'analyzePlayer',
      featureArea: 'insights',
      playerId,
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedAnalyzePlayer = withAdminObserved(
  'analyzePlayer',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  analyzePlayerImpl,
);
export async function analyzePlayer(
  playerId: string,
  options?: {
    includePatterns?: boolean;
    includeCausal?: boolean;
    includePredictions?: boolean;
    includeTrajectory?: boolean;
    depth?: 'quick' | 'standard' | 'deep';
  }
): Promise<{ success: boolean; analysis?: PlayerAnalysis; error?: string }> {
  return observedAnalyzePlayer(playerId, options);
}

// ============================================================================
// GENERATE PLAYER INSIGHT
// ============================================================================

async function generatePlayerInsightImpl(playerId: string): Promise<{
  success: boolean;
  insight?: ComposedInsight;
  patterns?: MinedPattern[];
  prediction?: PerformancePrediction;
  error?: string;
}> {
  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const rateLimit = await gateCoachHelmEngineCall(access.userId);
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    // F061 — coach-facing on-demand insight; honor the coach's Detail Level.
    const verbosity = access.coachId
      ? (await getCoachPhilosophy(access.coachId)).insightVerbosity
      : undefined;

    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: true,
      includeCausal: true,
      includePredictions: true,
      depth: 'standard',
      verbosity,
    });

    if (!analysis) {
      return { success: false, error: 'Insufficient data for analysis' };
    }

    return {
      success: true,
      insight: analysis.primaryInsight,
      patterns: analysis.patterns.filter(p => p.isActive),
      prediction: analysis.predictions[0],
    };
  } catch (error) {
    await logServerError(`generatePlayerInsight failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'generatePlayerInsight',
      featureArea: 'insights',
      playerId,
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGeneratePlayerInsight = withAdminObserved(
  'generatePlayerInsight',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  generatePlayerInsightImpl,
);
export async function generatePlayerInsight(playerId: string): Promise<{
  success: boolean;
  insight?: ComposedInsight;
  patterns?: MinedPattern[];
  prediction?: PerformancePrediction;
  error?: string;
}> {
  return observedGeneratePlayerInsight(playerId);
}

// ============================================================================
// INSIGHT CATEGORIZATION & GROUPING HELPERS
// ============================================================================

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  putting: 'Putting',
  ball_striking: 'Ball Striking',
  short_game: 'Short Game',
  course_management: 'Course Management',
  mental_game: 'Mental Game',
  scoring: 'Scoring Trends',
  shot_pattern: 'Shot Patterns',
  team_trend: 'Team Trends',
  general: 'General',
};

function categorizeComposedInsight(insight: ComposedInsight): InsightCategory {
  const text = (insight.headline + ' ' + insight.body).toLowerCase();

  // Priority order matters — check more specific terms first to avoid false matches
  // (e.g., "approach" would match ball_striking before course_management)
  if (text.includes('three-putt') || text.includes('lag putt') || text.includes('green reading') ||
      text.includes('putt make') || text.includes('putts per') || text.includes('start line') ||
      (text.includes('putt') && !text.includes('approach') && !text.includes('dispersion')))
    return 'putting';
  if (text.includes('scrambl') || text.includes('short game') || text.includes('chip') ||
      text.includes('around the green') || text.includes('sand save') || text.includes('bunker') ||
      text.includes('up-and-down') || text.includes('pitch'))
    return 'short_game';
  if (text.includes('shot pattern') || text.includes('dispersion') || text.includes('miss pattern') ||
      text.includes('miss left') || text.includes('miss right') || text.includes('miss short') ||
      text.includes('miss long') || text.includes('lie-dependent'))
    return 'shot_pattern';
  if (text.includes('approach') || text.includes('gir') || text.includes('iron') ||
      text.includes('proximity') || text.includes('green in regulation'))
    return 'ball_striking';
  if (text.includes('tee') || text.includes('fairway') || text.includes('driving') ||
      text.includes('off the tee') || text.includes('tee shot'))
    return 'ball_striking';
  if (text.includes('penalty') || text.includes('course manage') || text.includes('decision') ||
      text.includes('strategy') || text.includes('club selection'))
    return 'course_management';
  if (text.includes('pressure') || text.includes('closing') || text.includes('mental') ||
      text.includes('composure') || text.includes('tournament') || text.includes('qualifying'))
    return 'mental_game';
  if (text.includes('scoring') || text.includes('score') || text.includes('par 3') ||
      text.includes('par 4') || text.includes('par 5') || text.includes('birdie') || text.includes('bogey'))
    return 'scoring';

  return 'general';
}

/** Map SG metric keys from buildStatInsightsForTeam to InsightCategory */
function mapMetricKeyToCategory(key: string): InsightCategory {
  switch (key) {
    case 'strokes_gained_tee':
    case 'driving_accuracy_percentage':
      return 'ball_striking';
    case 'strokes_gained_approach':
    case 'gir_percentage':
      return 'ball_striking';
    case 'strokes_gained_around_green':
    case 'scrambling_percentage':
      return 'short_game';
    case 'strokes_gained_putting':
    case 'putts_per_round':
      return 'putting';
    default:
      return 'general';
  }
}

/**
 * Extract a sub-issue key from an insight for finer-grained grouping.
 * Instead of lumping all "putting concerns" together, this distinguishes
 * "three-putt rate" from "lag putting" from "SG Putting" etc.
 */
function extractSubIssue(insight: TeamComposedInsight): string {
  const text = (insight.headline + ' ' + insight.body).toLowerCase();

  // Putting sub-issues
  if (text.includes('three-putt')) return 'three_putt';
  if (text.includes('lag putt')) return 'lag_putting';
  if (text.includes('putts per') || text.includes('putt make')) return 'putt_efficiency';
  if (text.includes('start line') || text.includes('green reading')) return 'green_reading';

  // Ball striking sub-issues
  if (text.includes('gir') || text.includes('green in regulation')) return 'gir';
  if (text.includes('approach') || text.includes('proximity')) return 'approach';
  if (text.includes('fairway') || text.includes('driving') || text.includes('tee shot')) return 'driving';

  // Short game sub-issues
  if (text.includes('sand') || text.includes('bunker')) return 'sand';
  if (text.includes('scrambl') || text.includes('up-and-down')) return 'scrambling';

  // Mental game sub-issues
  if (text.includes('pressure') || text.includes('tournament')) return 'pressure';
  if (text.includes('closing') || text.includes('finish')) return 'closing';

  // Scoring sub-issues
  if (text.includes('par 3')) return 'par3';
  if (text.includes('par 4')) return 'par4';
  if (text.includes('par 5')) return 'par5';

  // Shot pattern sub-issues
  if (text.includes('dispersion')) return 'dispersion';
  if (text.includes('miss pattern') || text.includes('miss left') || text.includes('miss right')) return 'miss_direction';

  return 'general';
}

function toneBucket(tone: InsightTone): string {
  if (tone === 'urgent' || tone === 'cautionary') return 'concern';
  if (tone === 'encouraging' || tone === 'celebratory') return 'positive';
  return 'info';
}

function groupAndDeduplicateInsights(
  insights: TeamComposedInsight[],
  totalPlayers: number
): InsightGroup[] {
  // Group by (category, sub-issue, toneBucket) for finer granularity.
  // This prevents "SG Putting is bad" and "Three-putt rate is high" from collapsing
  // into the same group — they're different issues within the same category.
  const groupMap = new Map<string, TeamComposedInsight[]>();

  for (const insight of insights) {
    const cat = insight.category || 'general';
    const bucket = toneBucket(insight.tone);
    const subIssue = extractSubIssue(insight);
    const key = `${cat}::${subIssue}::${bucket}`;

    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(insight);
  }

  const toneRank: Record<string, number> = {
    urgent: 0, cautionary: 1, neutral: 2, encouraging: 3, celebratory: 4,
  };

  const groups: InsightGroup[] = [];

  for (const [key, members] of groupMap) {
    // Deduplicate players
    const playerMap = new Map<string, string>();
    for (const m of members) {
      if (m.playerId && m.playerName) {
        playerMap.set(m.playerId, m.playerName);
      }
    }
    const players = Array.from(playerMap, ([playerId, playerName]) => ({ playerId, playerName }));

    // Sort members by severity then confidence
    members.sort((a, b) => {
      const toneDiff = (toneRank[a.tone] ?? 5) - (toneRank[b.tone] ?? 5);
      if (toneDiff !== 0) return toneDiff;
      return b.confidence - a.confidence;
    });

    const topInsight = members[0];
    if (!topInsight) continue;
    const [category] = key.split('::');
    const isTeamWide = totalPlayers > 2 && players.length >= Math.ceil(totalPlayers * 0.5);
    const catLabel = CATEGORY_LABELS[category as InsightCategory] || 'Insights';

    // Synthesize headline — preserve specificity from the top insight
    let headline: string;
    if (players.length === 0) {
      // No player context (team alert) — use original headline
      headline = topInsight.headline;
    } else if (players.length === 1) {
      // Single player — use original insight headline (already has player name from buildStatInsightsForTeam)
      const singlePlayer = players[0]!;
      headline = topInsight.headline.includes(singlePlayer.playerName)
        ? topInsight.headline
        : `${singlePlayer.playerName}: ${topInsight.headline}`;
    } else if (isTeamWide) {
      // Team-wide — extract the specific issue from the top insight headline
      const issueDescription = extractIssueFromHeadline(topInsight.headline, catLabel);
      headline = `Team-wide: ${issueDescription}`;
    } else {
      // Multiple players — same: preserve the specific issue
      const issueDescription = extractIssueFromHeadline(topInsight.headline, catLabel);
      headline = `${players.length} players: ${issueDescription}`;
    }

    // Synthesize body
    let body: string;
    if (members.length === 1 || players.length <= 1) {
      body = topInsight.body;
    } else {
      // Show first names, then the worst insight's data as representative
      const names = players.map(p => p.playerName.split(' ')[0]);
      const nameList = names.length <= 4
        ? names.join(', ')
        : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
      body = `Affecting ${nameList}. ${topInsight.body}`;
    }

    // Compute max stroke impact across all members
    const memberImpacts = members
      .map(m => m.strokeImpact)
      .filter((v): v is number => v !== undefined && v > 0);
    const maxStrokeImpact = memberImpacts.length > 0
      ? Math.max(...memberImpacts)
      : undefined;

    groups.push({
      id: key,
      category: category as InsightCategory,
      tone: topInsight.tone,
      headline,
      body,
      callToAction: topInsight.callToAction,
      confidence: Math.max(...members.map(m => m.confidence)),
      strokeImpact: maxStrokeImpact,
      players,
      memberInsights: members,
      playerCount: players.length,
      isTeamWide,
    });
  }

  // Sort groups: urgent first, then by stroke impact, then player count, then confidence
  groups.sort((a, b) => {
    const toneDiff = (toneRank[a.tone] ?? 5) - (toneRank[b.tone] ?? 5);
    if (toneDiff !== 0) return toneDiff;
    const impactDiff = (b.strokeImpact ?? 0) - (a.strokeImpact ?? 0);
    if (Math.abs(impactDiff) > 0.1) return impactDiff;
    if (a.playerCount !== b.playerCount) return b.playerCount - a.playerCount;
    return b.confidence - a.confidence;
  });

  return groups;
}

/**
 * Extracts the specific issue description from a headline for group synthesis.
 * E.g., "John: Putting is costing strokes" → "Putting is costing strokes"
 * E.g., "After Week+ Layoff: Scoring Suffers (+1.2)" → "After Week+ Layoff: Scoring Suffers"
 * Falls back to catLabel if no useful text can be extracted.
 */
function extractIssueFromHeadline(headline: string, fallback: string): string {
  // If headline has "PlayerName: Issue" pattern, extract the issue part
  const colonIdx = headline.indexOf(':');
  if (colonIdx > 0 && colonIdx < headline.length - 2) {
    const afterColon = headline.slice(colonIdx + 1).trim();
    // Only use if it's meaningful (not just a category label)
    if (afterColon.length > 3) return afterColon;
  }
  // If the headline itself is short and specific, use it
  if (headline.length <= 50 && headline.length > 5) return headline;
  return fallback;
}

// ============================================================================
// GENERATE TEAM INSIGHT (Returns insights, patterns, predictions)
// ============================================================================

async function generateTeamInsightImpl(): Promise<{
  success: boolean;
  insights?: TeamComposedInsight[];
  insightGroups?: InsightGroup[];
  patterns?: MinedPattern[];
  predictions?: Array<PerformancePrediction & { playerName?: string }>;
  playersAnalyzed?: number;
  playersWithoutData?: number;
  playersMissingData?: string[];
  error?: string;
}> {
  const supabase = await createClient();
  const startTime = Date.now();

  try {
    // 1. Get current coach
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Rate-limit the whole-roster engine sweep (self-scoped DoS vector
    // otherwise — same gate the per-player/per-round entrypoints use).
    const rateLimit = await gateCoachHelmEngineCall(user.id);
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    // Get coach and look up team_id via organization
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Resolve the coach's ACTIVE team (cookie-aware; handles multi-team programs
    // and the men's/women's toggle). Falls back to the coach's primary team.
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

    if (!teamId) {
      return { success: false, error: 'No team assigned' };
    }

    // 2. Check if CoachHelm is enabled.
    // `isCoachHelmEnabledForCoach` comes from the @/lib/coachhelm/v2 barrel,
    // so this is the FIRST line that forces evaluation of the whole engine
    // module graph. If a transitive import cycle ever surfaces a load-time
    // TDZ again (see the 2026-06-22 composite index↔synthesis fix), it would
    // throw HERE — before any rollup wrapper — and otherwise land in the
    // generic outer catch. Wrap it so the failure is labeled precisely.
    let status: Awaited<ReturnType<typeof isCoachHelmEnabledForCoach>>;
    try {
      status = await isCoachHelmEnabledForCoach(coach.id);
    } catch (gateErr) {
      await logServerError(
        `generateTeamInsight.isCoachHelmEnabledForCoach failed: ${gateErr instanceof Error ? gateErr.message : String(gateErr)}`,
        {
          action: 'generateTeamInsight.engineGateCheck',
          featureArea: 'insights',
          extra: {
            stackHint: gateErr instanceof Error && gateErr.stack
              ? gateErr.stack.split('\n').slice(0, 4).join(' | ')
              : 'no-stack',
          },
        },
      );
      return { success: false, error: 'CoachHelm engine failed to initialize. Please try again.' };
    }
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    // 3. Get all players on team via golf_team_members
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    const playerIds = (teamMembers || []).map(m => m.player_id);
    if (playerIds.length === 0) {
      return { success: false, error: 'No players found' };
    }

    const { data: players, error: playersError } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', playerIds);

    if (playersError || !players || players.length === 0) {
      return { success: false, error: 'No players found' };
    }

    // Fetch stats cache for stat insights + team-level pattern/forecast generation
    const { data: statsRows } = await supabase
      .from('golf_player_stats_cache')
      .select(
        'player_id, rounds_in_calculation, scoring_average, scoring_average_vs_par, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting, gir_percentage, driving_accuracy_percentage, scrambling_percentage, putts_per_round, approach_proximity_average, three_putt_percentage, penalty_strokes_per_round, putt_make_pct_5_10ft, putt_make_pct_10_15ft, putt_make_pct_15_25ft, approach_miss_left_pct, approach_miss_right_pct, approach_miss_short_pct, approach_miss_long_pct, par3_average, par4_average, par5_average, last_5_average, improvement_trend, trend_direction, best_round, worst_round'
      )
      .in('player_id', playerIds);

    // Fetch recent rounds for team-level patterns and forecasts
    const { data: allRoundsData } = await supabase
      .from('golf_rounds')
      .select('player_id, total_score, score_to_par, round_date, round_type, created_at')
      .in('player_id', playerIds)
      .eq('status', 'completed')
      .order('round_date', { ascending: false });

    // Fetch coach philosophy using helper that properly maps DB fields
    const philosophy = await getCoachPhilosophy(coach.id);

    // 4. Analyze each player with V2 engine - BATCHED to avoid connection pool exhaustion
    const allInsights: TeamComposedInsight[] = [];
    const allPatterns: MinedPattern[] = [];
    const allPredictions: Array<PerformancePrediction & { playerName?: string }> = [];

    // Process players in batches of 3
    const BATCH_SIZE = 3;
    const analysisResults: Array<{ player: TeamPlayerRow; playerName: string; analysis: PlayerAnalysis | null; success: boolean }> = [];

    for (let i = 0; i < players.length; i += BATCH_SIZE) {
      const batch = players.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (player) => {
          try {
            const playerName = [player.first_name, player.last_name]
              .filter(Boolean)
              .join(' ')
              .trim();

            const analysis = await coachHelmIntelligence.analyzePlayer(player.id, {
              includePatterns: true,
              includeCausal: true,
              includePredictions: true,
              depth: 'standard',
              // F061 — honor the coach's saved Insight Detail Level in the NLG.
              verbosity: philosophy.insightVerbosity,
            });

            return { player, playerName, analysis, success: true };
          } catch (playerError) {
            await logServerError(`generateTeamInsight player analysis failed: ${playerError instanceof Error ? playerError.message : String(playerError)}`, {
              action: 'generateTeamInsight.analyzePlayer',
              featureArea: 'insights',
              playerId: player.id,
            });
            return { player, playerName: '', analysis: null, success: false };
          }
        })
      );
      analysisResults.push(...batchResults);
    }

    // Aggregate results
    let playersAnalyzed = 0;
    let playersWithoutData = 0;
    const playersMissingData: string[] = [];

    for (const result of analysisResults) {
      if (result.success && result.analysis) {
        playersAnalyzed++;

        // Collect insights — tag with player context and category
        if (result.analysis.insights) {
          for (const insight of result.analysis.insights) {
            allInsights.push({
              ...insight,
              playerId: result.player.id,
              playerName: result.playerName || undefined,
              category: categorizeComposedInsight(insight),
            });
          }
        }

        // Collect patterns
        if (result.analysis.patterns) {
          allPatterns.push(...result.analysis.patterns.filter(p => p.isActive));
        }

        if (result.analysis.predictions) {
          for (const prediction of result.analysis.predictions) {
            allPredictions.push({
              ...prediction,
              playerName: result.playerName || undefined,
            });
          }
        }
      } else {
        // Track players who couldn't be analyzed (likely missing round data)
        playersWithoutData++;
        if (result.playerName) {
          playersMissingData.push(result.playerName);
        }
      }
    }

    // If no players could be analyzed, return informative error
    if (playersAnalyzed === 0 && players.length > 0) {
      return {
        success: false,
        error: `Unable to analyze team: No players have completed rounds in the last 90 days. Players need round data for AI analysis.${playersMissingData.length > 0 ? ` Missing data for: ${playersMissingData.join(', ')}` : ''}`,
        playersAnalyzed: 0,
        playersWithoutData,
      };
    }

    // 5a-5d: Each team-level rollup is isolated in its own try/catch so a
    // single rollup failure (e.g. a TDZ/circular-import surfacing on Vercel's
    // minified bundle, seen 2026-06-22 in `generateAlerts`) cannot collapse the
    // entire analysis to "An unexpected error occurred". A failed rollup is
    // logged with the SPECIFIC call name and the analysis returns whatever did
    // succeed — the coach still sees per-player insights even if team-level
    // rollups are degraded.
    try {
      const statInsights = buildStatInsightsForTeam(
        players as TeamPlayerRow[],
        statsRows ?? [],
        philosophy
      );
      if (statInsights.length > 0) {
        allInsights.push(...statInsights);
      }
    } catch (statErr) {
      await logServerError(
        `generateTeamInsight.buildStatInsightsForTeam failed: ${statErr instanceof Error ? statErr.message : String(statErr)}`,
        { action: 'generateTeamInsight.buildStatInsightsForTeam', featureArea: 'insights' },
      );
    }

    // 5. Generate team-level patterns from stats cache
    try {
      const teamPatterns = generateTeamPatterns(
        players as Array<{ id: string; first_name: string; last_name: string }>,
        statsRows ?? [],
        allRoundsData ?? []
      );
      if (teamPatterns.length > 0) {
        allPatterns.push(...teamPatterns);
      }
    } catch (patternsErr) {
      await logServerError(
        `generateTeamInsight.generateTeamPatterns failed: ${patternsErr instanceof Error ? patternsErr.message : String(patternsErr)}`,
        { action: 'generateTeamInsight.generateTeamPatterns', featureArea: 'insights' },
      );
    }

    // TODO(engine): `generateTeamForecasts` is the sole remaining caller of
    // `@/lib/coachhelm/v2/prediction/team-forecaster`. Plan task B11 proposed
    // removing it as dead code; Phase 3 audit (2026-04-21) confirmed this
    // call path IS live — its output feeds `allPredictions` which are
    // surfaced on the intelligence dashboard. If the future workflow refactor
    // folds team-level forecasts into `coachHelmIntelligence.generatePredictions`,
    // delete this call and the module together.
    try {
      const teamForecasts = generateTeamForecasts(
        players as Array<{ id: string; first_name: string; last_name: string }>,
        statsRows ?? [],
        allRoundsData ?? []
      );
      if (teamForecasts.length > 0) {
        allPredictions.push(...teamForecasts);
      }
    } catch (forecastsErr) {
      await logServerError(
        `generateTeamInsight.generateTeamForecasts failed: ${forecastsErr instanceof Error ? forecastsErr.message : String(forecastsErr)}`,
        { action: 'generateTeamInsight.generateTeamForecasts', featureArea: 'insights' },
      );
    }

    // 6. Generate team-level alerts — tag as team_trend
    try {
      const teamAlerts = await coachHelmIntelligence.generateAlerts(coach.id, teamId);
      if (teamAlerts.length > 0) {
        for (const alert of teamAlerts) {
          allInsights.push({
            ...alert,
            category: 'team_trend' as InsightCategory,
          });
        }
      }
    } catch (alertsErr) {
      await logServerError(
        `generateTeamInsight.generateAlerts failed: ${alertsErr instanceof Error ? alertsErr.message : String(alertsErr)}`,
        { action: 'generateTeamInsight.generateAlerts', featureArea: 'insights' },
      );
    }

    // 6. Log generation — failure-silent. A log write failing must NEVER
    // collapse the response and turn a successful analysis into an error.
    const executionTime = Date.now() - startTime;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logTable = supabase.from('golf_insight_generation_log' as any) as any;
      const { error: logError } = await logTable.insert({
        team_id: teamId,
        insight_type: 'team_insight',
        insights_generated: allInsights.length,
        rounds_analyzed: playersAnalyzed,
        engine_version: 'coachhelm',
        duration_ms: executionTime,
      });
      if (logError && process.env.NODE_ENV === 'development') {
        console.warn('Insight generation log skipped:', logError.message);
      }
    } catch (logExc) {
      await logServerError(
        `generateTeamInsight.logGeneration failed: ${logExc instanceof Error ? logExc.message : String(logExc)}`,
        { action: 'generateTeamInsight.logGeneration', featureArea: 'insights' },
      );
    }

    // 7. Group and deduplicate insights — wrap so a grouping crash returns the
    // ungrouped list rather than collapsing the whole response.
    let insightGroups: InsightGroup[] = [];
    try {
      insightGroups = groupAndDeduplicateInsights(allInsights, players.length);
    } catch (groupErr) {
      await logServerError(
        `generateTeamInsight.groupAndDeduplicateInsights failed: ${groupErr instanceof Error ? groupErr.message : String(groupErr)}`,
        { action: 'generateTeamInsight.groupAndDeduplicateInsights', featureArea: 'insights' },
      );
      insightGroups = [];
    }

    // 8. Revalidate dashboard
    revalidatePath('/golf/dashboard');

    return {
      success: true,
      insights: allInsights,
      insightGroups,
      patterns: allPatterns,
      predictions: allPredictions,
      playersAnalyzed,
      playersWithoutData,
      playersMissingData: playersMissingData.length > 0 ? playersMissingData : undefined,
    };
  } catch (error) {
    // Capture the stack so the next failure tells us EXACTLY where it threw —
    // the inner try/catch wrappers above isolate the rollup calls, so anything
    // reaching here came from setup (auth/team-resolve/philosophy/load) or
    // post-rollup glue. Logged with full stack via logServerError → Sentry.
    const message = error instanceof Error ? error.message : String(error);
    const stackHint = error instanceof Error && error.stack
      ? error.stack.split('\n').slice(0, 3).join(' | ')
      : 'no-stack';
    await logServerError(`generateTeamInsight failed: ${message}`, {
      action: 'generateTeamInsight',
      featureArea: 'insights',
      extra: { stackHint },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGenerateTeamInsight = withAdminObserved(
  'generateTeamInsight',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  generateTeamInsightImpl,
);
export async function generateTeamInsight(): Promise<{
  success: boolean;
  insights?: TeamComposedInsight[];
  insightGroups?: InsightGroup[];
  patterns?: MinedPattern[];
  predictions?: Array<PerformancePrediction & { playerName?: string }>;
  playersAnalyzed?: number;
  playersWithoutData?: number;
  playersMissingData?: string[];
  error?: string;
}> {
  return observedGenerateTeamInsight();
}

// ============================================================================
// GENERATE PRACTICE RECOMMENDATIONS
// ============================================================================

async function generatePracticeRecommendationsImpl(playerId: string): Promise<{
  success: boolean;
  recommendations?: string[];
  focusAreas?: Array<{
    area: string;
    strokesGained: number;
    /** Display magnitude in the row's native unit (defaults to strokesGained). */
    value?: number;
    /** Native unit for `value`. Only 'strokes/round' traces to strokes_impact. */
    unit?: 'strokes/round' | 'yd from target' | 'opportunity';
    trend: 'improving' | 'stable' | 'declining';
    recommendation: string;
  }>;
  error?: string;
}> {
  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: true,
      includeCausal: true,
      includePredictions: false,
      depth: 'standard',
    });

    if (!analysis) {
      return { success: false, error: 'Insufficient data for recommendations' };
    }

    // Build focus areas from patterns
    const focusAreas = buildFocusAreasFromAnalysis(analysis);

    return {
      success: true,
      recommendations: analysis.recommendations,
      focusAreas,
    };
  } catch (error) {
    await logServerError(`generatePracticeRecommendations failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'generatePracticeRecommendations',
      featureArea: 'insights',
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGeneratePracticeRecommendations = withAdminObserved(
  'generatePracticeRecommendations',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  generatePracticeRecommendationsImpl,
);
export async function generatePracticeRecommendations(playerId: string): Promise<{
  success: boolean;
  recommendations?: string[];
  focusAreas?: Array<{
    area: string;
    strokesGained: number;
    /** Display magnitude in the row's native unit (defaults to strokesGained). */
    value?: number;
    /** Native unit for `value`. Only 'strokes/round' traces to strokes_impact. */
    unit?: 'strokes/round' | 'yd from target' | 'opportunity';
    trend: 'improving' | 'stable' | 'declining';
    recommendation: string;
  }>;
  error?: string;
}> {
  return observedGeneratePracticeRecommendations(playerId);
}

// ============================================================================
// GENERATE TOURNAMENT PREP
// ============================================================================

async function generateTournamentPrepImpl(playerId: string): Promise<{
  success: boolean;
  prediction?: PerformancePrediction;
  keyFactors?: string[];
  recommendations?: string[];
  error?: string;
}> {
  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: true,
      includeCausal: true,
      includePredictions: true,
      includeTrajectory: true,
      depth: 'deep',
    });

    if (!analysis) {
      return { success: false, error: 'Insufficient data for tournament prep' };
    }

    const prediction = analysis.predictions[0];
    const keyFactors = prediction?.keyDrivers || prediction?.inputFeatures || [];

    return {
      success: true,
      prediction,
      keyFactors,
      recommendations: analysis.recommendations,
    };
  } catch (error) {
    await logServerError(`generateTournamentPrep failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'generateTournamentPrep',
      featureArea: 'insights',
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGenerateTournamentPrep = withAdminObserved(
  'generateTournamentPrep',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  generateTournamentPrepImpl,
);
export async function generateTournamentPrep(playerId: string): Promise<{
  success: boolean;
  prediction?: PerformancePrediction;
  keyFactors?: string[];
  recommendations?: string[];
  error?: string;
}> {
  return observedGenerateTournamentPrep(playerId);
}

// ============================================================================
// GET PLAYER PATTERNS
// ============================================================================

async function getPlayerPatternsImpl(playerId: string): Promise<{
  success: boolean;
  patterns?: MinedPattern[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    // Check if enabled
    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    // Query patterns from database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

    const { data: patterns, error } = await patternsTable
      .select('*')
      .eq('player_id', playerId)
      .eq('is_active', true)
      .order('stroke_impact', { ascending: false })
      .limit(10);

    if (error) {
      // Table might not exist yet
      return { success: true, patterns: [] };
    }

    // Transform to MinedPattern type
    const transformedPatterns: MinedPattern[] = (patterns || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      playerId: p.player_id as string,
      patternType: p.pattern_type as MinedPattern['patternType'],
      conditions: p.conditions as MinedPattern['conditions'],
      outcome: p.outcome as MinedPattern['outcome'],
      support: p.support as number,
      confidence: p.confidence as number,
      lift: p.lift as number,
      conviction: p.conviction as number,
      strokeImpact: p.stroke_impact as number,
      actionability: p.actionability as number,
      sampleSize: p.sample_size as number,
      firstDetected: p.first_detected as string,
      lastOccurrence: p.last_occurrence as string,
      occurrenceCount: p.occurrence_count as number,
      trend: p.trend as MinedPattern['trend'],
      isActive: p.is_active as boolean,
      description: (p.metadata as Record<string, string>)?.description,
      recommendation: (p.metadata as Record<string, string>)?.recommendation,
    }));

    return { success: true, patterns: transformedPatterns };
  } catch (error) {
    await logServerError(`getPlayerPatterns failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getPlayerPatterns',
      featureArea: 'insights',
      playerId,
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGetPlayerPatterns = withAdminObserved(
  'getPlayerPatterns',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getPlayerPatternsImpl,
);
export async function getPlayerPatterns(playerId: string): Promise<{
  success: boolean;
  patterns?: MinedPattern[];
  error?: string;
}> {
  return observedGetPlayerPatterns(playerId);
}

// ============================================================================
// GENERATE ROUND REVIEW
// ============================================================================

async function generateRoundReviewImpl(
  roundId: string,
  playerId: string
): Promise<{
  success: boolean;
  review?: Awaited<ReturnType<typeof coachHelmIntelligence.generateRoundReview>>;
  error?: string;
}> {
  try {
    // Verify user has access to this round
    const access = await verifyRoundAccess(roundId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    // Rate-limit engine entrypoint
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    const rateLimit = await gateCoachHelmEngineCall(user?.id);
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    // Check if enabled
    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    const review = await coachHelmIntelligence.generateRoundReview(roundId, playerId);

    if (!review) {
      return { success: false, error: 'Insufficient data for review' };
    }

    return { success: true, review };
  } catch (error) {
    await logServerError(`generateRoundReview (insights) failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'generateRoundReview',
      featureArea: 'insights',
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGenerateRoundReview = withAdminObserved(
  'generateRoundReview',
  { sport: 'golf', feature: 'round_review_ai' },
  generateRoundReviewImpl,
);
export async function generateRoundReview(
  roundId: string,
  playerId: string
): Promise<{
  success: boolean;
  review?: Awaited<ReturnType<typeof coachHelmIntelligence.generateRoundReview>>;
  error?: string;
}> {
  return observedGenerateRoundReview(roundId, playerId);
}

// ============================================================================
// RECORD USER INTERACTION (LEARNING)
// ============================================================================

async function recordInteractionImpl(
  entityId: string,
  entityType: 'coach' | 'player',
  interactionType: 'view' | 'click' | 'expand' | 'collapse' | 'dismiss' | 'action' | 'share' | 'feedback',
  targetType?: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean }> {
  try {
    await coachHelmIntelligence.learn({
      entityId,
      entityType,
      interactionType,
      targetType: targetType ?? 'unknown',
      timestamp: new Date().toISOString(),
      metadata,
    });

    return { success: true };
  } catch (error) {
    await logServerError(`recordCoachHelmInteraction failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'recordCoachHelmInteraction',
      featureArea: 'insights',
    });
    return { success: false };
  }
}

const observedRecordInteraction = withAdminObserved(
  'recordInteraction',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  recordInteractionImpl,
);
export async function recordInteraction(
  entityId: string,
  entityType: 'coach' | 'player',
  interactionType: 'view' | 'click' | 'expand' | 'collapse' | 'dismiss' | 'action' | 'share' | 'feedback',
  targetType?: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean }> {
  return observedRecordInteraction(entityId, entityType, interactionType, targetType, metadata);
}

// ============================================================================
// GET COACHHELM STATUS
// ============================================================================

async function getCoachHelmStatusImpl(
  entityType: 'coach' | 'player',
  entityId: string
): Promise<{
  success: boolean;
  enabled: boolean;
  disabledReason?: string | null;
}> {
  try {
    const status = entityType === 'coach'
      ? await isCoachHelmEnabledForCoach(entityId)
      : await isCoachHelmEnabledForPlayer(entityId);

    return {
      success: true,
      enabled: status.effectivelyEnabled,
      disabledReason: status.disabledReason,
    };
  } catch (error) {
    await logServerError(`getCoachHelmStatus failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getCoachHelmStatus',
      featureArea: 'insights',
    });
    return { success: false, enabled: true };
  }
}

const observedGetCoachHelmStatus = withAdminObserved(
  'getCoachHelmStatus',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getCoachHelmStatusImpl,
);
export async function getCoachHelmStatus(
  entityType: 'coach' | 'player',
  entityId: string
): Promise<{
  success: boolean;
  enabled: boolean;
  disabledReason?: string | null;
}> {
  return observedGetCoachHelmStatus(entityType, entityId);
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

async function getPlayerCoachHelmDashboardImpl(
  playerId: string
): Promise<{ success: boolean; data?: PlayerCoachHelmDashboardData; error?: string; errorCode?: 'COACHHELM_DISABLED' | 'UNAUTHORIZED' | 'NOT_FOUND' }> {
  const supabase = await createClient();

  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized', errorCode: 'UNAUTHORIZED' };
    }

    // Check if CoachHelm is enabled for this player
    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled', errorCode: 'COACHHELM_DISABLED' };
    }

    // Get player info
    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .eq('id', playerId)
      .single();

    if (playerError || !player) {
      return { success: false, error: 'Player not found', errorCode: 'NOT_FOUND' };
    }

    const playerName = [player.first_name, player.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Player';

    // Run analysis to get all insights
    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: true,
      includeCausal: true,
      includePredictions: true,
      includeShotPatterns: true,
      depth: 'standard',
    });

    // Get recent rounds for review
    const { data: recentRoundsData } = await supabase
      .from('golf_rounds')
      .select('id, course_name, round_date, total_score, score_to_par')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(5);

    const recentRounds = (recentRoundsData || []).map(r => ({
      id: r.id,
      courseName: r.course_name || 'Unknown Course',
      date: r.round_date,
      score: r.total_score || 0,
      scoreToPar: r.score_to_par || 0,
      hasReview: true, // All completed rounds can have AI review generated
    }));

    // Build focus areas from patterns and features
    const focusAreas = buildFocusAreasFromAnalysis(analysis);

    // Determine player state from analysis
    const playerState = analysis?.features?.contextual?.formCycle === 'peak' ||
                        analysis?.features?.contextual?.formCycle === 'rising'
      ? 'improving'
      : analysis?.features?.contextual?.formCycle === 'declining' ||
        analysis?.features?.contextual?.formCycle === 'trough'
        ? 'struggling'
        : analysis?.features?.temporal?.recentFormScore !== undefined
          ? analysis.features.temporal.recentFormScore > 0.2
            ? 'improving'
            : analysis.features.temporal.recentFormScore < -0.2
              ? 'struggling'
              : 'stable'
          : 'unknown';

    // Fold in evidence-backed insights persisted to `golf_coach_insights`
    // by the new Tier-1 generators (putt-analytics, approach-analytics, …).
    // These rows carry the canonical `evidence` JSONB shape and should be
    // surfaced to the player UI alongside the in-memory composed insights.
    // We prepend them so the evidence-heavy material is the first thing the
    // player reads — the in-memory engine still produces broader narrative
    // insights below.
    const persistedInsights = await loadEvidenceBackedInsights(supabase, playerId);

    const mergedInsights: ComposedInsight[] = [
      ...persistedInsights,
      ...(analysis?.insights ?? []),
    ];

    const dashboardData: PlayerCoachHelmDashboardData = {
      playerId,
      playerName,
      lastUpdated: new Date().toISOString(),
      prediction: analysis?.predictions?.[0] ?? null,
      insights: mergedInsights,
      focusAreas,
      recentRounds,
      playerState,
      alertLevel: analysis?.alertLevel ?? 'none',
    };

    return { success: true, data: dashboardData };
  } catch (error) {
    await logServerError(`getPlayerCoachHelmDashboard failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getPlayerCoachHelmDashboard',
      featureArea: 'insights',
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGetPlayerCoachHelmDashboard = withAdminObserved(
  'getPlayerCoachHelmDashboard',
  { sport: 'golf', feature: 'player_coachhelm_dashboard' },
  getPlayerCoachHelmDashboardImpl,
);
export async function getPlayerCoachHelmDashboard(
  playerId: string
): Promise<{ success: boolean; data?: PlayerCoachHelmDashboardData; error?: string; errorCode?: 'COACHHELM_DISABLED' | 'UNAUTHORIZED' | 'NOT_FOUND' }> {
  return observedGetPlayerCoachHelmDashboard(playerId);
}

/**
 * Loads evidence-backed insights from `golf_coach_insights` for surfacing in
 * the player dashboard. Only pulls rows that carry structured `evidence`
 * (the new foundation shape) and are in a player-facing lifecycle state.
 *
 * Returns ComposedInsight objects with `id`, `evidence`, and `category`
 * tagged on so the UI can render the EvidencePanel + DrillAttachment and
 * route feedback actions to the right row.
 */
async function loadEvidenceBackedInsights(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<ComposedInsight[]> {
  try {
    // W36: also pull insight_type so we can apply the per-coach
    // ranking weight before returning.
    // Route through the SINGLE shared product-visibility helper (P3) instead of
    // a hand-rolled copy of the v3-engine + lifecycle + dismissed predicates,
    // so any future change to the shared constants propagates here too. Without
    // the v3 scope, legacy v2 rows (stale 'scoring'/'course_management' with
    // physically-impossible strokes_impact up to ~42/round) leak in and, after
    // the score.ts ceiling clamp, still outrank every correct v3 insight. We
    // ALSO keep `.eq('dismissed', false)` for the boolean column (the shared
    // helper guards `status<>'dismissed'`; both exclusions are belt-and-braces).
    const { data, error } = await applyInsightVisibility(
      supabase
        .from('golf_coach_insights')
        .select('id, title, content, evidence, category, insight_type, priority, lifecycle_state, metadata, created_at')
        .eq('player_id', playerId)
        .not('evidence', 'is', null),
    )
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !data) return [];

    const projected = data
      .filter((row): row is typeof row & { evidence: Record<string, unknown> } => !!row.evidence)
      .map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const evidence = row.evidence as any;
        const confidence =
          typeof evidence?.confidence === 'number' ? evidence.confidence : 0.6;
        const tone =
          row.lifecycle_state === 'matured' ? 'urgent' : 'cautionary';
        return {
          headline: row.title,
          body: row.content ?? '',
          tone,
          confidence,
          strokeImpact: typeof evidence?.strokes_impact === 'number' ? evidence.strokes_impact : undefined,
          id: row.id,
          evidence,
          category: row.category ?? undefined,
          insight_type: row.insight_type,
          metric: typeof evidence?.metric === 'string' ? evidence.metric : undefined,
          priority: (row.priority as InsightPriority | null) ?? undefined,
          sample_n: typeof evidence?.sample_n === 'number' ? evidence.sample_n : undefined,
        } as ComposedInsight & {
          id: string; evidence: unknown; category?: string; insight_type: string;
          metric?: string; priority?: InsightPriority; sample_n?: number;
        };
      });

    // W36 ranking: |strokes_impact| × confidence × coach_weight × goalBoost.
    // Loaded weights only include rows with sample_n ≥ 10 (un-calibrated
    // dimensions default to 1.0 inside scoreInsight).
    //
    // Tier-2 audit #6 (2026-05-27): also fetch the player's active goals
    // once so insights touching a goal's metric/category float to the top
    // (1.5× for one match, 2.0× for ≥2). Failure to load goals is non-
    // fatal — we fall back to neutral ranking rather than failing the page.
    const weights = await loadCoachWeightsForPlayer(supabase, playerId);
    const activeGoals = await loadActiveGoals(playerId).catch(() => []);
    const ranked = rankInsights(
      projected.map((p) => ({
        insight_type: p.insight_type,
        strokes_impact: p.strokeImpact ?? 0,
        confidence: p.confidence ?? 0,
        metric: p.metric,
        category: p.category,
        priority: p.priority,
        sample_n: p.sample_n,
        _ref: p,
      })),
      weights,
      activeGoals,
    );
    return ranked.map((r) => r._ref);
  } catch {
    return [];
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Build focus areas from analysis data */
function buildFocusAreasFromAnalysis(analysis: PlayerAnalysis | null): PlayerCoachHelmDashboardData['focusAreas'] {
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function averageNumber(values: Array<number | string | null | undefined>): number | null {
  const filtered = values
    .map((v) => (v != null ? Number(v) : NaN))
    .filter((v): v is number => Number.isFinite(v));
  if (filtered.length === 0) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function formatSigned(value: number | string, decimals = 2): string {
  const num = Number(value ?? 0);
  const formatted = num.toFixed(decimals);
  return num > 0 ? `+${formatted}` : formatted;
}

function formatPercent(value: number | string): string {
  return `${Number(value ?? 0).toFixed(0)}%`;
}

function computeInsightConfidence(rounds: number | null | undefined): number {
  const roundsCount = rounds ?? 0;
  const normalized = clampNumber(roundsCount / 20, 0, 1);
  return clampNumber(0.45 + normalized * 0.4, 0.45, 0.85);
}

function buildStatInsightsForTeam(
  players: TeamPlayerRow[],
  statsRows: PlayerStatsCacheRow[],
  philosophy: CoachPhilosophy
): TeamComposedInsight[] {
  if (!statsRows || statsRows.length === 0) return [];

  const playerNameById = new Map<string, string>();
  for (const player of players) {
    const name = [player.first_name, player.last_name].filter(Boolean).join(' ').trim() || 'Player';
    playerNameById.set(player.id, name);
  }

  const statsByPlayer = new Map(
    statsRows.map((row) => [row.player_id, row])
  );

  const teamAverages = {
    sgTotal: averageNumber(statsRows.map((row) => row.strokes_gained_total)),
    sgTee: averageNumber(statsRows.map((row) => row.strokes_gained_tee)),
    sgApproach: averageNumber(statsRows.map((row) => row.strokes_gained_approach)),
    sgAround: averageNumber(statsRows.map((row) => row.strokes_gained_around_green)),
    sgPutting: averageNumber(statsRows.map((row) => row.strokes_gained_putting)),
    gir: averageNumber(statsRows.map((row) => row.gir_percentage)),
    fairway: averageNumber(statsRows.map((row) => row.driving_accuracy_percentage)),
    scrambling: averageNumber(statsRows.map((row) => row.scrambling_percentage)),
    putts: averageNumber(statsRows.map((row) => row.putts_per_round)),
  };

  const insightsWithSeverity: Array<{ insight: TeamComposedInsight; severity: number }> = [];

  if (philosophy.showStrokesGained) {
    const teamSgEntries = [
      { key: 'sgTee', label: 'Off the Tee', value: teamAverages.sgTee },
      { key: 'sgApproach', label: 'Approach', value: teamAverages.sgApproach },
      { key: 'sgAround', label: 'Around the Green', value: teamAverages.sgAround },
      { key: 'sgPutting', label: 'Putting', value: teamAverages.sgPutting },
    ].filter((entry) => entry.value !== null);

    if (teamSgEntries.length > 0) {
      const teamWeakness = teamSgEntries.reduce((worst, entry) =>
        (entry.value as number) < (worst.value as number) ? entry : worst
      );
      if ((teamWeakness.value as number) < -0.3) {
        const teamDrillMap: Record<string, string> = {
          'Off the Tee': `Dedicate 30% of team practice to driving accuracy. Run a team fairway-hit competition: 10 drives each, track percentage. Players below 50% should consider strategy clubs on narrow holes.`,
          'Approach': `Run a team proximity challenge: everyone hits from 150 yds, measure average proximity. Set a team target of 30 ft avg. Focus practice on distance control — most approach misses are distance, not direction.`,
          'Around the Green': `Implement a weekly scramble drill: 10 up-and-down attempts from varied lies. Track team scrambling %. Set a team goal (e.g., 55% up-and-down rate). Focus on landing zone selection over shot creativity.`,
          'Putting': `Weekly putting combine: 10 putts from 6 ft (make %), 10 from 30 ft (inside 3 ft %). Post results. The team that tracks putting metrics improves 2x faster. Focus on eliminating 3-putts before chasing makes.`,
        };
        insightsWithSeverity.push({
          insight: {
            headline: `Team SG ${teamWeakness.label}: ${formatSigned(teamWeakness.value as number)} per round`,
            body: `${teamWeakness.label} is the biggest drag on team scoring. Team SG ${teamWeakness.label} averages ${formatSigned(teamWeakness.value as number)} per round — the weakest category across the roster. Improving this one area would have the highest team-wide scoring impact.`,
            callToAction: teamDrillMap[teamWeakness.label] ?? `Prioritize practice plans that lift ${teamWeakness.label.toLowerCase()} performance across the roster.`,
            tone: 'cautionary',
            confidence: 0.7,
            category: 'team_trend',
          },
          severity: Math.abs(teamWeakness.value as number),
        });
      }
    }
  }

  for (const player of players) {
    const stats = statsByPlayer.get(player.id);
    if (!stats) continue;

    const rounds = stats.rounds_in_calculation ?? 0;
    if (rounds < 5) continue;

    const playerName = playerNameById.get(player.id) ?? 'Player';
    const confidence = computeInsightConfidence(rounds);

    const playerInsights: Array<{ insight: TeamComposedInsight; severity: number }> = [];

    if (philosophy.showStrokesGained) {
      const sgMetrics = [
        {
          key: 'strokes_gained_tee',
          label: 'Off the Tee',
          value: stats.strokes_gained_tee,
          action: `Drill: 10-ball dispersion test on the range — aim at a fairway-width target (30 yds) from 250 yds. Track hit rate. Goal: 7/10. Also practice tee shot strategy: pick a specific miss side for each hole shape.`,
          teamAvg: teamAverages.sgTee,
        },
        {
          key: 'strokes_gained_approach',
          label: 'Approach',
          value: stats.strokes_gained_approach,
          action: `Drill: Proximity ladder — hit 5 shots each from 100, 125, 150, 175 yds. Measure average distance to pin. Goal: inside 25 ft from 150 yds. Focus on distance control over direction.`,
          teamAvg: teamAverages.sgApproach,
        },
        {
          key: 'strokes_gained_around_green',
          label: 'Around the Green',
          value: stats.strokes_gained_around_green,
          action: `Drill: Up-and-down challenge from 4 spots (short-sided rough, fringe, bunker, long-sided). 10 balls each spot. Track up-and-down %. Goal: 50%+ from each lie. Emphasize landing spot selection.`,
          teamAvg: teamAverages.sgAround,
        },
        {
          key: 'strokes_gained_putting',
          label: 'Putting',
          value: stats.strokes_gained_putting,
          action: `Drill: 3-putt eliminator — putt 10 balls from 30-40 ft, count how many finish inside 3 ft. Goal: 8/10. Also run gate drill for start line: two tees just wider than ball, 3 ft away. 20 putts, track makes.`,
          teamAvg: teamAverages.sgPutting,
        },
      ].filter((metric) => metric.value !== null);

      if (sgMetrics.length > 0) {
        const worst = sgMetrics.reduce((a, b) =>
          (a.value as number) < (b.value as number) ? a : b
        );
        const best = sgMetrics.reduce((a, b) =>
          (a.value as number) > (b.value as number) ? a : b
        );

        if (Number(worst.value ?? 0) <= -0.5) {
          const teamDelta =
            worst.teamAvg != null
              ? Number(worst.value ?? 0) - Number(worst.teamAvg ?? 0)
              : null;
          const vsTeam = teamDelta != null
            ? ` (${formatSigned(teamDelta)} vs team avg)`
            : '';
          const severity = Math.abs(Number(worst.value ?? 0));
          playerInsights.push({
            insight: {
              headline: `${playerName}: SG ${worst.label} ${formatSigned(Number(worst.value ?? 0))}`,
              body: `Losing ${severity.toFixed(1)} strokes per round ${worst.label.toLowerCase()}${vsTeam}. Over ${rounds} rounds, this area is the biggest opportunity for improvement.`,
              callToAction: worst.action,
              tone: severity >= 1.0 ? 'urgent' : 'cautionary',
              confidence,
              strokeImpact: severity,
              playerId: player.id,
              playerName,
              category: mapMetricKeyToCategory(worst.key),
            },
            severity,
          });
        }

        if (Number(best.value ?? 0) >= 0.5) {
          const teamDelta =
            best.teamAvg != null
              ? Number(best.value ?? 0) - Number(best.teamAvg ?? 0)
              : null;
          const vsTeam = teamDelta != null
            ? ` (${formatSigned(teamDelta)} vs team avg)`
            : '';
          playerInsights.push({
            insight: {
              headline: `${playerName}: SG ${best.label} ${formatSigned(Number(best.value ?? 0))}`,
              body: `Gaining ${Number(best.value ?? 0).toFixed(1)} strokes per round ${best.label.toLowerCase()}${vsTeam}. This is a clear competitive advantage.`,
              callToAction: `Keep reinforcing ${best.label.toLowerCase()} strengths in practice plans.`,
              tone: 'celebratory',
              confidence,
              playerId: player.id,
              playerName,
              category: mapMetricKeyToCategory(best.key),
            },
            severity: Math.abs(Number(best.value ?? 0)),
          });
        }
      }
    }

    if (philosophy.showAdvancedStats) {
      const advancedMetrics = [
        {
          key: 'gir_percentage',
          label: 'GIR%',
          value: stats.gir_percentage,
          teamAvg: teamAverages.gir,
          thresholdDiff: 8,
          thresholdAbsolute: 50,
          higherIsBetter: true,
          action: `Drill: Approach accuracy circuit — pick 6 approach distances (80-180 yds), hit 5 shots each, track how many land on the green. Focus on club selection: most GIR misses come from wrong club, not bad swings. Consider going one club more.`,
        },
        {
          key: 'driving_accuracy_percentage',
          label: 'Fairway%',
          value: stats.driving_accuracy_percentage,
          teamAvg: teamAverages.fairway,
          thresholdDiff: 8,
          thresholdAbsolute: 50,
          higherIsBetter: true,
          action: `Drill: Corridor driving — set alignment sticks 30 yds apart on the range and hit 20 drives. Track hit rate. If below 60%, evaluate: is the miss pattern one-sided? May need a strategy club (3W/hybrid) on tight holes instead of driver.`,
        },
        {
          key: 'scrambling_percentage',
          label: 'Scrambling%',
          value: stats.scrambling_percentage,
          teamAvg: teamAverages.scrambling,
          thresholdDiff: 8,
          thresholdAbsolute: 45,
          higherIsBetter: true,
          action: `Drill: Scramble circuit — drop balls in 6 different short-game situations (buried lie, tight lie, uphill, downhill, bunker, rough). Play each to the hole and track up-and-down %. Goal: save par 50%+ overall. Focus on getting the first putt inside 5 ft.`,
        },
        {
          key: 'putts_per_round',
          label: 'Putts per round',
          value: stats.putts_per_round,
          teamAvg: teamAverages.putts,
          thresholdDiff: 1,
          thresholdAbsolute: 33.5,
          higherIsBetter: false,
          action: `Drill: Lag putt challenge — 10 putts from 30+ ft, all must stop inside a 3-ft circle. Then 10 putts from 6-10 ft to build confidence on makeable range. Track 3-putts per round as the #1 putting KPI to reduce.`,
        },
      ].filter((metric) => metric.value !== null);

      for (const metric of advancedMetrics) {
        const value = metric.value as number;
        const teamAvg = metric.teamAvg;
        const delta = teamAvg != null
          ? metric.higherIsBetter
            ? teamAvg - value
            : value - teamAvg
          : null;
        const diffTrigger = delta != null && delta >= metric.thresholdDiff;
        const absoluteTrigger = metric.higherIsBetter
          ? value <= metric.thresholdAbsolute
          : value >= metric.thresholdAbsolute;

        if (diffTrigger || absoluteTrigger) {
          const formattedValue = metric.higherIsBetter
            ? formatPercent(value)
            : Number(value ?? 0).toFixed(1);
          const teamAvgFormatted = teamAvg != null
            ? (metric.higherIsBetter ? formatPercent(teamAvg) : Number(teamAvg ?? 0).toFixed(1))
            : null;

          const severity = delta != null
            ? Math.abs(delta)
            : Math.abs(value - metric.thresholdAbsolute);

          playerInsights.push({
            insight: {
              headline: `${playerName}: ${metric.label} at ${formattedValue}`,
              body: `${metric.label} is ${formattedValue}${teamAvgFormatted ? ` vs team avg ${teamAvgFormatted}` : ''} across ${rounds} rounds.`,
              callToAction: metric.action,
              tone: severity >= 10 ? 'urgent' : 'cautionary',
              confidence,
              playerId: player.id,
              playerName,
              category: mapMetricKeyToCategory(metric.key),
            },
            severity,
          });
        }
      }
    }

    if (playerInsights.length > 0) {
      playerInsights.sort((a, b) => b.severity - a.severity);
      // Keep top 3 per player to avoid losing important insights
      insightsWithSeverity.push(...playerInsights.slice(0, 3));
    }
  }

  // Cap at ~3 insights per player (grouping will consolidate overlaps)
  const maxInsights = Math.max(12, players.length * 3);
  return insightsWithSeverity
    .sort((a, b) => b.severity - a.severity)
    .slice(0, maxInsights)
    .map((entry) => entry.insight);
}

// ============================================================================
// ACKNOWLEDGE COMPOSED INSIGHT (For V2 in-memory insights)
// ============================================================================

/**
 * Acknowledges a composed insight by persisting it to the database and marking
 * it as acknowledged in one operation. Used for V2 insights that are generated
 * in-memory and don't have a database ID yet.
 */
async function acknowledgeComposedInsightImpl(
  insight: ComposedInsight,
  playerId?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach info
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Resolve the coach's ACTIVE team (cookie-aware; handles multi-team programs
    // and the men's/women's toggle). Falls back to the coach's primary team.
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

    // Insert the insight with acknowledged status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('golf_coach_insights')
      .insert({
        coach_id: coach.id,
        team_id: teamId,
        player_id: playerId || null,
        insight_type: 'pattern_detected',  // maps to allowed DB type
        priority: mapToneToPriority(insight.tone, insight.confidence),
        title: insight.headline,
        content: insight.body,
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
        metadata: {
          confidence: insight.confidence,
          tone: insight.tone,
          v2_engine: true,
          recommendation: insight.callToAction || '',
          reasoning_steps: insight.reasoning?.reasoningChain?.length ?? 0,
        },
      });

    if (insertError) {
      await logServerError(`acknowledgeComposedInsight persist failed: ${insertError.message}`, {
        action: 'acknowledgeComposedInsight.persist',
        featureArea: 'insights',
        extra: { errorCode: insertError.code },
      });
      return { success: false, error: 'Failed to save insight' };
    }

    // Record interaction for learning
    try {
      await recordInteraction(coach.id, 'coach', 'action', 'insight_acknowledged', {
        insightTone: insight.tone,
        confidence: insight.confidence,
      });
    } catch (err) {
      // Non-critical, don't fail the operation
      await logServerError(`acknowledgeComposedInsight interaction recording failed: ${err instanceof Error ? err.message : String(err)}`, {
        action: 'acknowledgeComposedInsight.recordInteraction',
        featureArea: 'insights',
      }, 'warning');
    }

    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (error) {
    await logServerError(`acknowledgeComposedInsight failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'acknowledgeComposedInsight',
      featureArea: 'insights',
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedAcknowledgeComposedInsight = withAdminObserved(
  'acknowledgeComposedInsight',
  { sport: 'golf', feature: 'insights_management' },
  acknowledgeComposedInsightImpl,
);
export async function acknowledgeComposedInsight(
  insight: ComposedInsight,
  playerId?: string
): Promise<{ success: boolean; error?: string }> {
  return observedAcknowledgeComposedInsight(insight, playerId);
}

// ============================================================================
// DISMISS COMPOSED INSIGHT (For V2 in-memory insights)
// ============================================================================

/**
 * Dismisses a composed insight by persisting it to the database and marking
 * it as dismissed in one operation. Used for V2 insights that are generated
 * in-memory and don't have a database ID yet.
 */
async function dismissComposedInsightImpl(
  insight: ComposedInsight,
  playerId?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach info
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Resolve the coach's ACTIVE team (cookie-aware; handles multi-team programs
    // and the men's/women's toggle). Falls back to the coach's primary team.
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

    // Insert the insight with dismissed status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('golf_coach_insights')
      .insert({
        coach_id: coach.id,
        team_id: teamId,
        player_id: playerId || null,
        insight_type: 'pattern_detected',  // maps to allowed DB type
        priority: mapToneToPriority(insight.tone, insight.confidence),
        title: insight.headline,
        content: insight.body,
        status: 'dismissed',
        dismissed: true,
        dismissed_at: new Date().toISOString(),
        metadata: {
          confidence: insight.confidence,
          tone: insight.tone,
          v2_engine: true,
          recommendation: insight.callToAction || '',
          reasoning_steps: insight.reasoning?.reasoningChain?.length ?? 0,
        },
      });

    if (insertError) {
      await logServerError(`dismissComposedInsight persist failed: ${insertError.message}`, {
        action: 'dismissComposedInsight.persist',
        featureArea: 'insights',
        extra: { errorCode: insertError.code },
      });
      return { success: false, error: 'Failed to save insight' };
    }

    // Record interaction for learning
    try {
      await recordInteraction(coach.id, 'coach', 'dismiss', 'insight_dismissed', {
        insightTone: insight.tone,
        confidence: insight.confidence,
      });
    } catch (err) {
      // Non-critical, don't fail the operation
      await logServerError(`dismissComposedInsight interaction recording failed: ${err instanceof Error ? err.message : String(err)}`, {
        action: 'dismissComposedInsight.recordInteraction',
        featureArea: 'insights',
      }, 'warning');
    }

    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (error) {
    await logServerError(`dismissComposedInsight failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'dismissComposedInsight',
      featureArea: 'insights',
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedDismissComposedInsight = withAdminObserved(
  'dismissComposedInsight',
  { sport: 'golf', feature: 'insights_management' },
  dismissComposedInsightImpl,
);
export async function dismissComposedInsight(
  insight: ComposedInsight,
  playerId?: string
): Promise<{ success: boolean; error?: string }> {
  return observedDismissComposedInsight(insight, playerId);
}

// ============================================================================
// TRIGGER INSIGHTS FOR SINGLE PLAYER (called after round submission)
// ============================================================================

/**
 * Lightweight per-player insight generation triggered after a round is submitted.
 * Runs the V2 engine for just one player and stores any new insights.
 * Designed to be called fire-and-forget (errors are logged, not thrown).
 * SEMGREP-ALLOW: fire-and-forget post-response; caller submitGolfRoundComprehensive already revalidates dashboards
 */
async function triggerPlayerInsightsAfterRoundImpl(
  playerId: string
): Promise<{
  success: boolean;
  insights_created?: number;
  error?: string;
  partial?: boolean;
  /**
   * Stable, non-message-derived classification for the observability layer
   * (observeActionSoftFailure / severityForSoftFailure in
   * src/lib/admin/observe-action-result.ts). Set on the two `success: false`
   * outcomes below that are routine, expected states — not incidents — so
   * they're classified by this code instead of regex-matching the
   * user-facing `error` string.
   */
  code?: 'engine_no_recent_rounds' | 'engine_session_expired';
}> {
  const startTime = Date.now();
  // P0-04: track whether any mandatory generator failed so the caller
  // (postRoundTrigger) can mark the round PARTIAL rather than fully clean.
  let hadGeneratorFailures = false;

  try {
    const admin = createAdminClient();

    // Look up the player's coach and team
    const { data: membership } = await admin
      .from('golf_team_members')
      .select('team_id, golf_teams(organization_id)')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (!membership?.team_id) {
      return { success: false, error: 'No active team membership for player' };
    }

    const teamId = membership.team_id;
    const orgId = (membership.golf_teams as { organization_id: string } | null)?.organization_id;
    if (!orgId) return { success: false, error: 'Team organization not found' };

    // Find the coach for this organization
    const { data: coach } = await admin
      .from('golf_coaches')
      .select('id')
      .eq('organization_id', orgId)
      .limit(1)
      .single();

    if (!coach) return { success: false, error: 'Coach not found for team organization' };

    const { data: coachSettings } = await admin
      .from('golf_coachhelm_settings')
      .select('enabled, disabled_reason')
      .eq('coach_id', coach.id)
      .maybeSingle();
    if (coachSettings?.enabled === false) {
      return {
        success: false,
        error: coachSettings.disabled_reason || 'CoachHelm disabled for coach',
      };
    }

    const { data: teamSettings } = await admin
      .from('golf_team_coachhelm_settings')
      .select('enabled, disabled_reason')
      .eq('team_id', teamId)
      .maybeSingle();
    if (teamSettings?.enabled === false) {
      return {
        success: false,
        error: teamSettings.disabled_reason || 'CoachHelm disabled for team',
      };
    }

    // Get coach philosophy
    const philosophy = await getCoachPhilosophy(coach.id, admin);
    let confidenceThreshold = getConfidenceThreshold(philosophy.alertSensitivity);

    // W27 — alert_posture multiplier. The coach's per-player intent row
    // modulates the philosophy-level threshold so aggressive players get
    // more insights and silent players get none.
    const alertPosture = await loadAlertPostureForPlayer(playerId);
    confidenceThreshold *= alertPosture?.multiplier ?? 1.0;

    // 2026-07-17 — #920: alert_posture='silent' resolves to an infinite
    // confidence threshold above, which silently blocks EVERY insight for
    // this player — nothing in the run distinguishes "engine found nothing"
    // from "engine was gated shut by design." Surface it once per run (this
    // function already runs once per player per invocation) so it shows up
    // in the admin log feed instead of vanishing without a trace.
    if (alertPosture?.multiplier === Number.POSITIVE_INFINITY) {
      await logServerEvent(
        `[insights.triggerPlayerInsightsAfterRound] alert_posture=silent — insight gate blocked for this player (confidence threshold = Infinity)`,
        {
          action: 'insights.triggerPlayerInsightsAfterRound.silentPosture',
          featureArea: 'coachhelm',
          playerId,
          // Intentional coach setting, not a malfunction — admin-feed only, not Sentry.
          skipSentry: true,
        },
        'info',
      );
    }

    // 2026-05-24 Wave 7B — philosophy gate (replaces the post-filter sweep
    // that used to live below this block). Built once here so every Tier-1
    // generator inside analyzePlayer skips writes the coach's philosophy
    // would have archived anyway. `isInsightTypeEnabled` closes over
    // `philosophy` so the orchestrator and upsertInsight stay decoupled
    // from server-action code.
    const philosophyGate: PhilosophyGate = {
      confidenceThreshold,
      isInsightTypeEnabled: (insightType) =>
        shouldIncludeInsight(insightType as InsightType, philosophy),
    };

    // Run analysis for this single player.
    // analyzePlayer internally uses createClient() (user-scoped) which may fail in
    // fire-and-forget context where the user session is no longer available.
    // This is non-critical: the round saved successfully, only post-round insights are skipped.
    let analysis;
    try {
      analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
        includePatterns: true,
        includeCausal: true,
        includePredictions: true,
        includeShotPatterns: true,
        depth: 'standard',
        // F061 — flow the coach's saved Insight Detail Level into the NLG so
        // composed insight bodies honor 'brief' / 'detailed'.
        verbosity: philosophy.insightVerbosity,
        philosophyGate,
      });
    } catch {
      // Expected in fire-and-forget/cron contexts (roster-sweep, post-round
      // trigger) — analyzePlayer()'s user-scoped client has no session to
      // scope to once the originating request has finished. `code` lets the
      // observability layer classify this without regex-matching the
      // message (see EXPECTED_SOFT_FAILURE_CODES in observe-action-result.ts).
      return {
        success: false,
        error: 'Player analysis failed (likely session expired in background context)',
        code: 'engine_session_expired',
      };
    }

    if (!analysis) {
      // Legacy feature extraction returned null — but Tier-1 evidence-backed
      // generators run BEFORE feature extraction inside analyzePlayer and may
      // have already written insights. Check for those before reporting failure.
      const sinceIso = new Date(startTime - 1000).toISOString();
      const { count: tierOneCount } = await admin
        .from('golf_coach_insights')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .not('evidence', 'is', null)
        .gte('updated_at', sinceIso);
      if ((tierOneCount ?? 0) > 0) {
        return { success: true, insights_created: tierOneCount ?? 0 };
      }
      // No completed rounds in the last 90 days, AND no Tier-1 insights either
      // — this is a brand-new player or one who's been inactive too long.
      // Returning success:false here lets the caller distinguish this from a
      // real failure, but the caller (analyze-player API) treats it as 200
      // since there's no actual error to surface to ops. The dashboard
      // consumer uses optional chaining and degrades gracefully.
      // `code: 'engine_no_recent_rounds'` marks this as an expected
      // empty-state for observeActionSoftFailure (not a regex on this
      // message) — the nightly roster-sweep cron hits this constantly for
      // inactive players and it must stay out of the Errors tab / Sentry.
      return {
        success: false,
        error: 'No completed rounds in the last 90 days yet — insights will populate after the next round',
        code: 'engine_no_recent_rounds',
      };
    }

    // Tier-1 generators run independently. If some fail, others may have still
    // produced valid insights — short-circuiting here was marking the entire
    // round permanently failed (postRoundTrigger writes coachhelm_failed_at,
    // safety-net cron skips rounds where it's non-null) even when 8 of 9
    // generators succeeded. Log the failures for observability, continue with
    // whatever the orchestrator did emit.
    if (analysis.generatorSummary?.failures?.length) {
      hadGeneratorFailures = true;
      const failedGenerators = analysis.generatorSummary.failures
        .map((failure) => `${failure.generator}: ${failure.reason}`)
        .join('; ');
      await logServerError(
        `[insights.triggerPlayerInsightsAfterRound] partial generator failures (continuing): ${failedGenerators}`,
        { action: 'insights.triggerPlayerInsightsAfterRound', playerId }
      );
    }

    // 2026-05-24 Wave 8 — surface philosophy-gate filter count for
    // post-deploy verification. Logged at info (not warning — this is a
    // metric, not a malfunction) only when non-zero so log noise stays low;
    // the count tells us how much upstream filtering replaced the Wave 6
    // post-write archive sweep. The message itself is count-stable — the
    // count lives in `extra.gatedCount`, never interpolated into the string
    // — so every occurrence fingerprints as ONE stream instead of minting a
    // new fingerprint per distinct count (Bridge incident hygiene: a message
    // that embeds a variable value can never be deduped).
    if (analysis.tier1GateMetrics && analysis.tier1GateMetrics.gatedCount > 0) {
      await logServerEvent(
        `[insights.triggerPlayerInsightsAfterRound] philosophy gate filtered tier-1 insights`,
        {
          action: 'insights.triggerPlayerInsightsAfterRound.gateMetrics',
          featureArea: 'coachhelm',
          playerId,
          // Routine philosophy-gate filter counter — admin-feed only, not Sentry (issue 20).
          skipSentry: true,
          extra: { gatedCount: analysis.tier1GateMetrics.gatedCount },
        },
        'info',
      );
    }

    // 2026-05-24 Wave 7B — Tier-1 post-filter REMOVED.
    // Replaced by upstream `philosophyGate` plumbed through analyzePlayer
    // and read by upsertInsight via AsyncLocalStorage. See
    // src/lib/coachhelm/v2/insights/gate-context.ts. Gated insights are
    // now never written, instead of written-then-archived.

    // Archive stale V2 insights so post-round analysis can refresh them.
    // Without this, insights from weeks ago block new ones via dedup, causing 0-insight generations.
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await admin
      .from('golf_coach_insights')
      .update({ status: 'resolved' })
      .eq('coach_id', coach.id)
      .eq('player_id', playerId)
      .eq('status', 'active')
      .lt('created_at', threeDaysAgo)
      .contains('metadata', { v2_engine: true });

    // Check remaining active insights to avoid duplicates within the 3-day window
    const { data: existingInsights } = await admin
      .from('golf_coach_insights')
      .select('player_id, insight_type')
      .eq('coach_id', coach.id)
      .eq('player_id', playerId)
      .eq('status', 'active');

    const existingKeys = new Set(
      (existingInsights || [])
        .filter((i): i is { player_id: string; insight_type: string } =>
          i.player_id !== null && i.insight_type !== null,
        )
        .map((i) => `${i.player_id}:${i.insight_type}`),
    );

    // Convert V2 insights to records
    const newInsights: InsightRecord[] = [];
    for (let i = 0; i < analysis.insights.length; i++) {
      const insight = analysis.insights[i];
      if (!insight || insight.confidence < confidenceThreshold) continue;

      const pattern = analysis.patterns[i];
      const prediction = analysis.predictions[0];

      const record = convertV2ToInsightRecord(
        insight, playerId, coach.id, teamId, pattern, prediction
      );

      if (!shouldIncludeInsight(record.insight_type as InsightType, philosophy)) continue;

      const key = `${playerId}:${record.insight_type}`;
      if (!existingKeys.has(key)) {
        newInsights.push(record);
        existingKeys.add(key);
      }
    }

    // Add high-impact pattern insights
    if (shouldIncludeInsight('recurring_weakness', philosophy)) {
      for (const pattern of analysis.patterns.filter(p => p.isActive && p.strokeImpact > 1 && p.confidence >= confidenceThreshold)) {
        const patternInsight: InsightRecord = {
          coach_id: coach.id,
          team_id: teamId,
          insight_type: 'pattern_detected',
          priority: Number(pattern.strokeImpact ?? 0) > 2 ? 'high' : 'medium',
          player_id: playerId,
          title: `Pattern: ${pattern.description || 'Performance Pattern'}`,
          content: pattern.recommendation || `Pattern detected with ${(Number(pattern.confidence ?? 0) * 100).toFixed(0)}% confidence.`,
          metadata: {
            v2_engine: true,
            auto_triggered: true,
            pattern_type: pattern.patternType,
            support: pattern.support,
            sample_n: pattern.sampleSize ?? pattern.occurrenceCount,
            occurrence_count: pattern.occurrenceCount,
            confidence: pattern.confidence,
            stroke_impact: pattern.strokeImpact,
            recommendation: pattern.recommendation || 'Work with coach to address this pattern.',
          },
          status: 'active',
        };

        const patternKey = `${playerId}:${patternInsight.insight_type}:${pattern.id}`;
        if (!existingKeys.has(patternKey)) {
          newInsights.push(patternInsight);
          existingKeys.add(patternKey);
        }
      }
    }

    // Apply philosophy weighting and insert
    if (newInsights.length > 0) {
      const weighted = weightInsightsByPhilosophy(newInsights, philosophy);
      const cleanInsights = weighted.map(insight => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { philosophyScore, matchesCoachPriority, priorityCategory, strokeImpactScore, ...clean } = insight;
        return {
          ...clean,
          metadata: {
            ...clean.metadata,
            philosophy_score: philosophyScore,
            matches_coach_priority: matchesCoachPriority,
          },
        } as InsightRecord;
      });

      // 2026-05-17: toInsightInput now returns null when sample_n < MIN_SAMPLE_N.
      // Filter + log skipped legacy records rather than upsert inflated values.
      // Console-only — fires per round and was generating ~18 Sentry
      // events/day on operational telemetry, not real errors.
      const inputs = cleanInsights
        .map((record) => toInsightInput(record))
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const skipped = cleanInsights.length - inputs.length;
      if (skipped > 0) {
        console.warn(
          `[insights.triggerPlayerInsightsAfterRound] skipped ${skipped} legacy records (insufficient sample_n)`,
        );
      }
      await Promise.all(
        inputs.map((input) => upsertInsight(admin, input)),
      );

      // Push notification to coach: new insights generated (fire-and-forget)
      (async () => {
        try {
          const { data: coachUser } = await admin
            .from('golf_coaches')
            .select('user_id')
            .eq('id', coach.id)
            .single();

          if (coachUser?.user_id) {
            const { sendPushNotification } = await import('@/lib/notifications/push');
            await sendPushNotification('coachhelm_insight', coachUser.user_id, {
              insightTitle: `${newInsights.length} new insight${newInsights.length > 1 ? 's' : ''} after round`,
            });
          }
        } catch (pushErr) {
          await logServerError(`[Push] coachhelm_insight notification failed: ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`, { action: 'insights.triggerPlayerInsightsAfterRound' });
        }
      })();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('golf_insight_generation_log').insert({
      team_id: teamId,
      player_id: playerId,
      insight_type: 'post_round_v2',
      insights_generated: newInsights.length,
      rounds_analyzed: 1,
      engine_version: 'v2',
      duration_ms: Date.now() - startTime,
    });

    // NOTE: Do NOT call revalidatePath here — this function runs fire-and-forget
    // after the server action response has been sent, which is outside the allowed
    // context for revalidation. The caller (submitGolfRoundComprehensive) already
    // revalidates all relevant paths before invoking this.
    return { success: true, insights_created: newInsights.length, partial: hadGeneratorFailures };
  } catch (error) {
    await logServerError(
      `CoachHelm post-round trigger failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        action: 'triggerPlayerInsightsAfterRound',
        extra: {
          playerId,
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
      'error'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'CoachHelm post-round trigger failed',
    };
  }
}

// SECURITY: intentionally NOT exported. Every exported async function in a
// 'use server' file (this file) is a public, directly-POSTable action
// regardless of client references — and this skips the user auth gate
// entirely (admin client, caller-supplied playerId, generates insights).
//
// Post-round trigger is async fan-out fired FIRE-AND-FORGET from
// postRoundTrigger (src/lib/coachhelm/v2/post-round-trigger.ts) after the
// round-submit response is sent — the delegator below must keep returning
// the SAME promise the caller does (or doesn't) await, never converting the
// call into an awaited path (W15 B7 batch note).
const observedTriggerPlayerInsightsAfterRound = withAdminObserved(
  'triggerPlayerInsightsAfterRound',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  triggerPlayerInsightsAfterRoundImpl,
);

// Hands the observed impl above to the server-only bridge so trusted,
// non-'use server' callers (postRoundTrigger, the roster-sweep cron) can
// reach it without this file ever exporting it — see
// @/lib/coachhelm/v2/trigger-insights-bridge. The one legitimate
// CLIENT-reachable path (coach manual refresh) uses the still-exported
// `refreshPlayerAnalysisAsCoach` below, which calls
// `observedTriggerPlayerInsightsAfterRound` directly in-process.
__registerTriggerPlayerInsightsAfterRound(observedTriggerPlayerInsightsAfterRound);

/**
 * Coach-initiated manual refresh of a player's CoachHelm analysis.
 * Called from the coach's player-detail page. Awaits the engine (unlike the
 * fire-and-forget post-round trigger) so the UI can re-fetch immediately.
 */
async function refreshPlayerAnalysisAsCoachImpl(
  playerId: string,
): Promise<{ success: boolean; insightsCreated?: number; error?: string }> {
  const session = await getGolfSessionProfile();
  if (!session?.coach) {
    return { success: false, error: 'Unauthorized' };
  }

  // Rate-limit engine entrypoint (5/min/coach) — closes audit P0-11 DoS vector
  // where a coach could loop refreshPlayerAnalysisAsCoach across the roster.
  const rateLimit = await gateCoachHelmEngineCall(session.coach.id);
  if (!rateLimit.allowed) {
    return { success: false, error: rateLimit.error };
  }

  const orgId = session.coach.organization_id;
  if (!orgId) return { success: false, error: 'Coach has no organization' };

  const supabase = await createClient();

  // Resolve the coach's ACTIVE team (cookie-aware; handles multi-team programs
  // and the men's/women's toggle). Falls back to the coach's primary team.
  const teamId = await resolveCoachTeamIdWithCookie(supabase, orgId, session.coach.id);
  if (!teamId) return { success: false, error: 'Coach has no team' };

  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!membership) return { success: false, error: 'Player is not on your team' };

  // Session/team-membership already verified above; call the observed impl
  // directly in-process — this file no longer exports a bare
  // triggerPlayerInsightsAfterRound (see the SECURITY comment above it).
  const result = await observedTriggerPlayerInsightsAfterRound(playerId);

  if (result.success) {
    // GOLF IA REORG (final_migrations #11): the Scouting Report content this
    // insight run feeds now lives on the canonical /players/[playerId]/game
    // route (Scouting Report tab), not the legacy /players/[playerId] shim.
    revalidatePath(`/golf/dashboard/players/${playerId}/game`);
  }

  return {
    success: result.success,
    insightsCreated: result.insights_created,
    error: result.error,
  };
}

const observedRefreshPlayerAnalysisAsCoach = withAdminObserved(
  'refreshPlayerAnalysisAsCoach',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  refreshPlayerAnalysisAsCoachImpl,
);
export async function refreshPlayerAnalysisAsCoach(
  playerId: string,
): Promise<{ success: boolean; insightsCreated?: number; error?: string }> {
  return observedRefreshPlayerAnalysisAsCoach(playerId);
}

// ============================================================================
// REFRESH TEAM ANALYSIS (coach Triage Desk "Scan team")
// ============================================================================

/**
 * Re-runs the canonical CoachHelm engine for every active player on the
 * coach's currently selected team. The engine's Tier-1 generators own V3
 * upsert/retraction semantics, so refreshed signals replace stale rows under
 * stable `v3:` signatures instead of creating a second, legacy alert feed.
 *
 * Auth, cookie-aware team resolution, and the expensive-engine rate limit are
 * performed once for the batch. The trusted per-player implementation stays
 * private to this module; callers cannot supply a team or player id.
 */
async function refreshTeamAnalysisAsCoachImpl(): Promise<{
  success: boolean;
  playersAnalyzed?: number;
  insightsCreated?: number;
  playersSkipped?: number;
  playersFailed?: number;
  error?: string;
}> {
  const session = await getGolfSessionProfile();
  if (!session?.coach) return { success: false, error: 'Unauthorized' };

  const rateLimit = await gateCoachHelmEngineCall(session.coach.id);
  if (!rateLimit.allowed) return { success: false, error: rateLimit.error };

  const orgId = session.coach.organization_id;
  if (!orgId) return { success: false, error: 'Coach has no organization' };

  const supabase = await createClient();
  const teamId = await resolveCoachTeamIdWithCookie(supabase, orgId, session.coach.id);
  if (!teamId) return { success: false, error: 'Coach has no team' };

  const { data: memberships, error: membershipError } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');
  if (membershipError) {
    await logServerError(`refreshTeamAnalysisAsCoach roster query failed: ${membershipError.message}`, {
      action: 'refreshTeamAnalysisAsCoach.roster',
      featureArea: 'coachhelm',
      extra: { teamId, errorCode: membershipError.code },
    });
    return { success: false, error: 'Could not load the active roster' };
  }

  const playerIds = Array.from(new Set((memberships ?? []).map((row) => row.player_id).filter(Boolean)));
  if (playerIds.length === 0) {
    return { success: true, playersAnalyzed: 0, insightsCreated: 0, playersSkipped: 0, playersFailed: 0 };
  }

  let playersAnalyzed = 0;
  let insightsCreated = 0;
  let playersSkipped = 0;
  let playersFailed = 0;
  const concurrency = 3;

  for (let i = 0; i < playerIds.length; i += concurrency) {
    const batch = playerIds.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((playerId) => observedTriggerPlayerInsightsAfterRound(playerId)),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        playersFailed += 1;
        continue;
      }
      if (!result.value.success) {
        playersSkipped += 1;
        continue;
      }
      playersAnalyzed += 1;
      insightsCreated += result.value.insights_created ?? 0;
      if (result.value.partial) playersFailed += 1;
    }
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/intelligence');
  revalidatePath('/golf/dashboard/insights');

  return { success: true, playersAnalyzed, insightsCreated, playersSkipped, playersFailed };
}

const observedRefreshTeamAnalysisAsCoach = withAdminObserved(
  'refreshTeamAnalysisAsCoach',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  refreshTeamAnalysisAsCoachImpl,
);

export async function refreshTeamAnalysisAsCoach(): Promise<{
  success: boolean;
  playersAnalyzed?: number;
  insightsCreated?: number;
  playersSkipped?: number;
  playersFailed?: number;
  error?: string;
}> {
  return observedRefreshTeamAnalysisAsCoach();
}

// ============================================================================
// TEAM COACHHELM SETTINGS — read/write
// ============================================================================
//
// Live schema (`golf_team_coachhelm_settings`):
//   id uuid pk, team_id uuid (unique fk -> golf_teams.id), enabled boolean,
//   disabled_at timestamptz nullable, disabled_by uuid nullable (-> users.id),
//   disabled_reason text nullable, created_at, updated_at.
//
// The gate at gate.ts:116 and the orchestrator at insights.ts:3081 already
// read this row to decide whether to skip CoachHelm processing for a team —
// but until now there was no writer or UI, so the row was never created and
// the toggle effectively defaulted to enabled.
//
// `getOrCreateTeamCoachHelmSettings`: reads (or lazily seeds) the row for a
// team. Auth: caller must be a coach in the team's organization.
//
// `updateTeamCoachHelmSettings`: applies a partial patch (currently only
// `enabled` is user-editable; flipping it false records `disabled_at`,
// `disabled_by`, and `disabled_reason`). Auth: head coach for the team.

export interface TeamCoachHelmSettings {
  id: string;
  team_id: string;
  enabled: boolean;
  disabled_at: string | null;
  disabled_by: string | null;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface TeamCoachHelmSettingsPatch {
  enabled?: boolean;
  disabled_reason?: string | null;
}

async function ensureCoachInTeamOrg(
  teamId: string,
): Promise<
  | { ok: true; userId: string; coachId: string; isHeadCoach: boolean }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: team } = await supabase
    .from('golf_teams')
    .select('id, organization_id')
    .eq('id', teamId)
    .maybeSingle();
  if (!team?.organization_id) return { ok: false, error: 'Team not found' };

  // First check coach belongs to the team's org, then use the
  // is_golf_team_primary_coach RPC for head-coach gating. The RPC is the
  // canonical primitive (SECURITY DEFINER, search_path locked) — replaces
  // the prior fragile `role.toLowerCase().includes('head')` string match.
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', team.organization_id)
    .maybeSingle();
  if (!coach) return { ok: false, error: 'Forbidden' };

  const { data: isPrimaryRaw } = await supabase.rpc('is_golf_team_primary_coach', {
    team_uuid: teamId,
  });
  const isHeadCoach = isPrimaryRaw === true;

  return { ok: true, userId: user.id, coachId: coach.id, isHeadCoach };
}

/**
 * P084 — resolve whether the current coach is the head coach for a team, using
 * the SAME canonical gate (`ensureCoachInTeamOrg` → `is_golf_team_primary_coach`
 * RPC) that `updateTeamCoachHelmSettings` enforces server-side. Settings pages
 * call this so the Team CoachHelm master switch can be rendered DISABLED for
 * assistant coaches (error prevention, Nielsen #5) instead of letting them flip
 * it and watch it revert with a permission error.
 */
async function getTeamCoachHelmAccessImpl(
  teamId: string,
): Promise<{ success: boolean; isHeadCoach: boolean; error?: string }> {
  if (!teamId) return { success: false, isHeadCoach: false, error: 'Team id required' };

  const access = await ensureCoachInTeamOrg(teamId);
  if (!access.ok) return { success: false, isHeadCoach: false, error: access.error };

  return { success: true, isHeadCoach: access.isHeadCoach };
}

const observedGetTeamCoachHelmAccess = withAdminObserved(
  'getTeamCoachHelmAccess',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getTeamCoachHelmAccessImpl,
);
export async function getTeamCoachHelmAccess(
  teamId: string,
): Promise<{ success: boolean; isHeadCoach: boolean; error?: string }> {
  return observedGetTeamCoachHelmAccess(teamId);
}

async function getOrCreateTeamCoachHelmSettingsImpl(
  teamId: string,
): Promise<{ success: boolean; settings?: TeamCoachHelmSettings; error?: string }> {
  if (!teamId) return { success: false, error: 'Team id required' };

  const access = await ensureCoachInTeamOrg(teamId);
  if (!access.ok) return { success: false, error: access.error };

  const supabase = await createClient();

  const { data: existing, error: selectError } = await supabase
    .from('golf_team_coachhelm_settings')
    .select(
      'id, team_id, enabled, disabled_at, disabled_by, disabled_reason, created_at, updated_at',
    )
    .eq('team_id', teamId)
    .maybeSingle();

  if (selectError) {
    await logServerError(
      `getOrCreateTeamCoachHelmSettings select failed: ${selectError.message}`,
      {
        action: 'insights.getOrCreateTeamCoachHelmSettings',
        featureArea: 'coachhelm_settings',
        extra: { teamId, errorCode: selectError.code },
      },
    );
    return { success: false, error: 'Failed to load team settings' };
  }

  if (existing) {
    return { success: true, settings: existing as TeamCoachHelmSettings };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('golf_team_coachhelm_settings')
    .insert({ team_id: teamId, enabled: true })
    .select(
      'id, team_id, enabled, disabled_at, disabled_by, disabled_reason, created_at, updated_at',
    )
    .single();

  if (insertError || !inserted) {
    await logServerError(
      `getOrCreateTeamCoachHelmSettings insert failed: ${insertError?.message ?? 'no row'}`,
      {
        action: 'insights.getOrCreateTeamCoachHelmSettings',
        featureArea: 'coachhelm_settings',
        extra: { teamId, errorCode: insertError?.code },
      },
    );
    return { success: false, error: 'Failed to create team settings' };
  }

  return { success: true, settings: inserted as TeamCoachHelmSettings };
}

const observedGetOrCreateTeamCoachHelmSettings = withAdminObserved(
  'getOrCreateTeamCoachHelmSettings',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getOrCreateTeamCoachHelmSettingsImpl,
);
export async function getOrCreateTeamCoachHelmSettings(
  teamId: string,
): Promise<{ success: boolean; settings?: TeamCoachHelmSettings; error?: string }> {
  return observedGetOrCreateTeamCoachHelmSettings(teamId);
}

async function updateTeamCoachHelmSettingsImpl(
  teamId: string,
  patch: TeamCoachHelmSettingsPatch,
): Promise<{ success: boolean; settings?: TeamCoachHelmSettings; error?: string }> {
  if (!teamId) return { success: false, error: 'Team id required' };

  const access = await ensureCoachInTeamOrg(teamId);
  if (!access.ok) return { success: false, error: access.error };
  if (!access.isHeadCoach) {
    return { success: false, error: 'Only the head coach can change CoachHelm settings' };
  }

  // Make sure a row exists before we update.
  const seed = await getOrCreateTeamCoachHelmSettings(teamId);
  if (!seed.success || !seed.settings) {
    return { success: false, error: seed.error || 'Failed to load team settings' };
  }

  const supabase = await createClient();

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof patch.enabled === 'boolean') {
    update.enabled = patch.enabled;
    if (patch.enabled === false) {
      update.disabled_at = new Date().toISOString();
      update.disabled_by = access.userId;
      if (typeof patch.disabled_reason === 'string') {
        update.disabled_reason = patch.disabled_reason;
      }
    } else {
      update.disabled_at = null;
      update.disabled_by = null;
      update.disabled_reason = null;
    }
  } else if (patch.disabled_reason !== undefined) {
    update.disabled_reason = patch.disabled_reason;
  }

  const { data: updated, error } = await fromUntyped(supabase, 'golf_team_coachhelm_settings')
    .update(update)
    .eq('team_id', teamId)
    .select(
      'id, team_id, enabled, disabled_at, disabled_by, disabled_reason, created_at, updated_at',
    )
    .single();

  if (error || !updated) {
    await logServerError(
      `updateTeamCoachHelmSettings failed: ${error?.message ?? 'no row'}`,
      {
        action: 'insights.updateTeamCoachHelmSettings',
        featureArea: 'coachhelm_settings',
        extra: { teamId, errorCode: error?.code },
      },
    );
    return { success: false, error: 'Failed to update team settings' };
  }

  revalidatePath('/golf/dashboard/settings/coaching-intelligence');
  revalidatePath('/golf/dashboard/intelligence');

  return { success: true, settings: updated as TeamCoachHelmSettings };
}

const observedUpdateTeamCoachHelmSettings = withAdminObserved(
  'updateTeamCoachHelmSettings',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  updateTeamCoachHelmSettingsImpl,
);
export async function updateTeamCoachHelmSettings(
  teamId: string,
  patch: TeamCoachHelmSettingsPatch,
): Promise<{ success: boolean; settings?: TeamCoachHelmSettings; error?: string }> {
  return observedUpdateTeamCoachHelmSettings(teamId, patch);
}
