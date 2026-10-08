'use server';

import { createClient } from '@/lib/supabase/server';
import { coachHelmIntelligence, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2';
import type {
  ComposedInsight,
  MinedPattern,
  PerformancePrediction,
  PlayerAnalysis,
  PlayerTrajectorySummary,
} from '@/lib/coachhelm/v2/types';
import { TrajectoryForecaster } from '@/lib/coachhelm/v2/prediction/trajectory-forecaster';
import { logServerError, logServerException } from '@/lib/server-error-logger';
import {
  verifyPlayerAccess as sharedVerifyPlayerAccess,
  verifyRoundBelongsToPlayer,
} from '@/lib/auth/verify-player-access';
// 2026-08-01: gateCoachHelmEngineCall used to live here (private). Lifted into
// @/lib/auth/action-rate-limit so alerts.ts, round-recap.ts, schedule-image.ts
// and v3/llm.ts share ONE definition. Key is unchanged (`coachhelm:engine:<id>`),
// so live counters are not orphaned.
import { gateCoachHelmEngineCall, gateUserAction } from '@/lib/auth/action-rate-limit';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { describeError } from '@/lib/utils/describe-error';
import { getStatsActionContext } from '@/lib/golf/stats-action-context';
import { isMissingGolfPatternsTableError } from '@/lib/golf/stats-pattern-error';
import { rankByAbsoluteStrokeImpact } from '@/lib/golf/pattern-impact-ranking';
import { buildFocusAreasFromAnalysis, getCoachPhilosophy, verifyPlayerAccessForInsights } from './insights-shared';

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
  // EVERY READ IN THIS GATE DECIDES WHAT SOMEONE IS TOLD.
  //
  // Denying on a failed read is right — an authorization check that could not
  // run must not pass — but each of these answered with a claim instead: the
  // round "not found" when it exists, or "not authorized" to the player who
  // owns it. Both read as verdicts and neither suggests trying again.
  const UNREADABLE = "Couldn't verify your access to this round. Please try again.";

  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select('player_id')
    .eq('id', roundId)
    .maybeSingle();

  // `.maybeSingle()` answers a genuine no-row with `data: null` and NO error.
  // `.single()` answered it with PGRST116 ("Cannot coerce the result to a
  // single JSON object"), and although the code here handled that code, the
  // Sentry Supabase integration captured it as an exception on every coach
  // view of a player's round (JAVASCRIPT-NEXTJS-Q9). Zero rows is a verdict
  // in this function, not a failure — a remaining error is a real read fault.
  if (roundError) {
    await logServerError(
      `verifyRoundAccess: round read failed for ${roundId}: ${describeError(roundError)}`,
      { action: 'insights.verifyRoundAccess', featureArea: 'rounds' },
      'warning',
    );
    return { authorized: false, error: UNREADABLE };
  }

  if (!round) {
    return { authorized: false, error: 'Round not found' };
  }

  // Check if user owns the round via player
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id')
    .eq('id', round.player_id)
    .eq('user_id', user.id)
    .maybeSingle();

  // A failure here is NOT "this user does not own the round". Falling through
  // to the coach branch on a failed ownership check is how a player ends up
  // denied access to their own round. (No-row is `player === null`, not an
  // error — see the round read above.)
  if (playerError) {
    await logServerError(
      `verifyRoundAccess: ownership read failed for round ${roundId}: ${describeError(playerError)}`,
      { action: 'insights.verifyRoundAccess', featureArea: 'rounds' },
      'warning',
    );
    return { authorized: false, error: UNREADABLE };
  }

  if (player) {
    return { authorized: true, userId: user.id, playerId: player.id };
  }

  // Check if user is a coach STAFFED on a team the round's player belongs to.
  // Staff-scoped (was a single arbitrary org team via .limit(1), which wrongly
  // denied access to half the players in a two-team program).
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError) {
    await logServerError(
      `verifyRoundAccess: coach read failed: ${describeError(coachError)}`,
      { action: 'insights.verifyRoundAccess', featureArea: 'rounds' },
      'warning',
    );
    return { authorized: false, error: UNREADABLE };
  }

  if (coach?.id) {
    const { data: staffRows, error: staffError } = await supabase
      .from('golf_team_coach_staff')
      .select('team_id')
      .eq('coach_id', coach.id);

    // No staff rows read means no team can be matched, so the coach is denied
    // for a reason that has nothing to do with their access.
    if (staffError) {
      await logServerError(
        `verifyRoundAccess: staff read failed for coach ${coach.id}: ${describeError(staffError)}`,
        { action: 'insights.verifyRoundAccess', featureArea: 'rounds' },
        'warning',
      );
      return { authorized: false, error: UNREADABLE };
    }
    const staffTeamIds = (staffRows ?? []).map((r) => r.team_id).filter(Boolean) as string[];

    if (staffTeamIds.length > 0) {
      const { data: teamMember, error: teamMemberError } = await supabase
        .from('golf_team_members')
        .select('id')
        .in('team_id', staffTeamIds)
        .eq('player_id', round.player_id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (teamMemberError) {
        await logServerError(
          `verifyRoundAccess: membership read failed for player ${round.player_id}: ${describeError(teamMemberError)}`,
          { action: 'insights.verifyRoundAccess', featureArea: 'rounds' },
          'warning',
        );
        return { authorized: false, error: UNREADABLE };
      }

      if (teamMember) {
        return { authorized: true, userId: user.id, playerId: round.player_id };
      }
    }
  }

  return { authorized: false, error: 'Not authorized to access this round' };
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
    await logServerError(`getPlayerFocusAreas failed: ${describeError(error)}`, {
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
    const access = await verifyPlayerAccessForInsights(playerId);
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
    await logServerError(`analyzePlayer failed: ${describeError(error)}`, {
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
    const access = await verifyPlayerAccessForInsights(playerId);
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
    await logServerError(`generatePlayerInsight failed: ${describeError(error)}`, {
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
    const access = await verifyPlayerAccessForInsights(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    // DS-02: analyzePlayer() is a multi-second, multi-table engine run. Without
    // this gate an authenticated coach can loop it across the roster and hold a
    // function instance hostage — same P0-11 vector analyzePlayerImpl gates for.
    const rateLimit = await gateCoachHelmEngineCall(access.userId);
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
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
    await logServerError(`generatePracticeRecommendations failed: ${describeError(error)}`, {
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
// GET PLAYER TRAJECTORY (#1485 — the first consumer of TrajectoryForecaster)
// ============================================================================

/**
 * Own bucket, not `coachhelm:engine`. That shared 5/min/user bucket exists for
 * discrete "Analyze" / "Generate plan" button clicks — this action instead
 * fires on ordinary page navigation (the player deep-dive's Scouting Report
 * tab), so sharing the bucket would let a coach browsing five players in a
 * minute exhaust the budget an "Analyze" click on the SIXTH page actually
 * needs. Room to click through a full roster without tripping it.
 */
const TRAJECTORY_RATE_LIMIT = { maxAttempts: 20, windowMs: 60 * 1000 } as const;
async function getPlayerTrajectoryImpl(playerId: string): Promise<{
  success: boolean;
  trajectory?: PlayerTrajectorySummary;
  /**
   * Set true ONLY when `success` is false because the forecaster itself
   * found too little round history (`TrajectoryForecaster`'s own
   * `rounds.length < 10` gate) — every other failure (auth, rate-limit,
   * disabled, unexpected) must NOT be presented to a coach as "not enough
   * rounds", which would be a false claim for a player with plenty of
   * history. The caller (the player deep-dive page) branches on this flag
   * rather than on `error`'s text.
   */
  insufficientHistory?: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Coach-only surface (see the player deep-dive page's own gate). Calls
    // the SHARED verifyPlayerAccess directly rather than this file's local
    // wrapper. #1571 (fixed 2026-09-22): the shared helper's coach branch
    // used to return `{ allowed: !!isCoach, reason: isCoach ? 'coach' :
    // 'denied' }` with no `coachId` ever assigned, despite the field's own
    // docblock claiming it is -- gating on `!access.coachId` here rejected
    // every real coach. `coachId` is now populated (verify-player-access.ts),
    // but `reason === 'coach'` is kept as the gate here since it's the more
    // direct signal and every other coach-only check in this file already
    // reads it the same way.
    const access = await sharedVerifyPlayerAccess(playerId, user.id, supabase);
    if (!access.allowed) {
      return { success: false, error: 'Not authorized to access this player' };
    }
    if (access.reason !== 'coach') {
      return { success: false, error: 'Not authorized' };
    }

    // See TRAJECTORY_RATE_LIMIT above for why this is its own bucket.
    const rateLimit = await gateUserAction(
      'coachhelm:trajectory',
      user.id,
      TRAJECTORY_RATE_LIMIT,
      'Too many trajectory requests in the last minute — please wait a moment and try again.',
    );
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    // Calls the forecaster directly rather than coachHelmIntelligence.analyzePlayer():
    // the full orchestrator unconditionally runs ~20 tier-1 generators + composite
    // synthesis + feature extraction on every call regardless of which optional
    // flags are set (see orchestrator.ts's analyzePlayer body) — a write-heavy,
    // multi-second run that is the wrong cost for "show the trajectory card".
    // TrajectoryForecaster.forecastTrajectory() alone is read-only: one feature
    // extraction + one 100-row golf_rounds query, no writes.
    const trajectory = await new TrajectoryForecaster(playerId).forecastTrajectory();
    if (!trajectory) {
      // success: true, not false — this is a NORMAL, common outcome (any
      // player under 10 rounds: early season, a new signee, a redshirt),
      // not an error. withAdminObserved (below, no observeSoftFailures
      // override) records every `{success: false}` return as an admin_events
      // soft failure — returning false here would file one on every such
      // page view, the same "an unconfigured team gets treated as broken"
      // class of bug coachhelm-review.md's budget-resolution note warns
      // about. `insufficientHistory` carries the reason for a caller that
      // wants to distinguish it from a genuine "nothing to show" result.
      return { success: true, insufficientHistory: true };
    }

    // Trimmed to what the card renders — see PlayerTrajectorySummary's
    // docblock for why the full forecast (scenarios alone repeat the whole
    // projections series 4x) doesn't cross this boundary.
    return {
      success: true,
      trajectory: {
        horizonDays: trajectory.horizonDays,
        projections: trajectory.projections,
        roundsAnalyzed: trajectory.roundsAnalyzed,
        modelConfidence: trajectory.modelConfidence,
      },
    };
  } catch (error) {
    await logServerError(`getPlayerTrajectory failed: ${describeError(error)}`, {
      action: 'getPlayerTrajectory',
      featureArea: 'insights',
      playerId,
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}
const observedGetPlayerTrajectory = withAdminObserved(
  'getPlayerTrajectory',
  { sport: 'golf', feature: 'coachhelm_ai_engine' },
  getPlayerTrajectoryImpl,
);
export async function getPlayerTrajectory(playerId: string): Promise<{
  success: boolean;
  trajectory?: PlayerTrajectorySummary;
  insufficientHistory?: boolean;
  error?: string;
}> {
  return observedGetPlayerTrajectory(playerId);
}
// ============================================================================
// GET PLAYER PATTERNS
// ============================================================================

async function observePlayerPatternsFailure(error: unknown, playerId: string): Promise<void> {
  const record =
    error && typeof error === 'object'
      ? (error as { code?: unknown; details?: unknown; hint?: unknown; status?: unknown })
      : null;
  const exception = error instanceof Error ? error : new Error(describeError(error));
  await logServerException(exception, {
    action: 'getPlayerPatterns',
    featureArea: 'insights',
    feature: 'coachhelm_ai_engine',
    sport: 'golf',
    playerId,
    errorCode: typeof record?.code === 'string' ? record.code : undefined,
    statusCode: typeof record?.status === 'number' ? record.status : undefined,
    metadata: {
      ...(typeof record?.details === 'string' ? { pg_details: record.details } : {}),
      ...(typeof record?.hint === 'string' ? { pg_hint: record.hint } : {}),
    },
  });
}
/** Patterns returned to the player/coach surfaces. */
const PLAYER_PATTERNS_TOP_N = 10;
/** Upper bound on the rows read before ranking (PostgREST caps a response at 1000). */
const PLAYER_PATTERNS_READ_CAP = 500;
async function getPlayerPatternsImpl(playerId: string): Promise<{
  success: boolean;
  patterns?: MinedPattern[];
  error?: string;
}> {
  const shared = getStatsActionContext();
  const supabase =
    shared?.requestedPlayerId === playerId ? shared.supabase : await createClient();

  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccessForInsights(playerId);
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

    // `stroke_impact` is signed (a leak is negative), so `ORDER BY stroke_impact
    // DESC LIMIT 10` kept the ten biggest POSITIVE rows and dropped the biggest
    // leaks. PostgREST cannot order by abs(): read the player's active rows
    // (bounded; production holds at most a few dozen per player) and rank by
    // absolute impact in JS before cutting to ten.
    const { data: patternRows, error } = await patternsTable
      .select('*')
      .eq('player_id', playerId)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .limit(PLAYER_PATTERNS_READ_CAP);

    if (isMissingGolfPatternsTableError(error)) {
      return { success: true, patterns: [] };
    }
    if (error) {
      await observePlayerPatternsFailure(error, playerId);
      return { success: false, error: 'Failed to load player patterns' };
    }

    const patterns = rankByAbsoluteStrokeImpact(
      (patternRows ?? []) as Array<Record<string, unknown> & { id?: string; stroke_impact?: number | null }>,
      PLAYER_PATTERNS_TOP_N,
    );

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
    await observePlayerPatternsFailure(error, playerId);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
const observedGetPlayerPatterns = withAdminObserved(
  'getPlayerPatterns',
  {
    sport: 'golf',
    feature: 'coachhelm_ai_engine',
    // The implementation records real query/transform failures once with
    // PostgREST details. Keep the wrapper for thrown gaps and the global
    // server-action coverage contract, but do not duplicate returned failures.
    observeSoftFailures: false,
  },
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

    // ...and that the round is actually THIS player's. The check above
    // authorizes the ROUND and says nothing about `playerId`, so a caller
    // holding one accessible round could name any player id and have the
    // engine build the analysis from that player's history instead. Both
    // arguments must describe the same subject before the engine runs.
    if (!(await verifyRoundBelongsToPlayer(roundId, playerId))) {
      return { success: false, error: 'Not authorized' };
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
    await logServerError(`generateRoundReview (insights) failed: ${describeError(error)}`, {
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
    // DS-01: this action had zero auth work and forwarded a caller-supplied
    // entityId straight into the learning store, which writes through the
    // service-role client (behavior-learner.ts getClient()) — RLS is genuinely
    // bypassed. Flooded 'dismiss' rows against another tenant's coach id
    // throttle that coach's insight delivery (dismissalRate > 0.5 =>
    // alertFrequency 'low'). Authenticate, then bind entityId to the caller.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false };
    }

    if (entityType === 'player') {
      const access = await verifyPlayerAccessForInsights(entityId);
      if (!access.authorized) {
        return { success: false };
      }
    } else {
      // A user can hold more than one golf_coaches row (multi-org), so
      // .single()/.maybeSingle() would be wrong here.
      const { data: coachRows } = await supabase
        .from('golf_coaches')
        .select('id')
        .eq('user_id', user.id);
      const isSelfCoach = (coachRows ?? []).some((c) => c.id === entityId);
      if (!isSelfCoach) {
        return { success: false };
      }
    }

    // Bound insert volume — the learning store is append-only and unbounded.
    const rateLimit = await gateCoachHelmEngineCall(user.id);
    if (!rateLimit.allowed) {
      return { success: false };
    }

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
    await logServerError(`recordCoachHelmInteraction failed: ${describeError(error)}`, {
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
