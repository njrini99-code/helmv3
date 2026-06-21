'use server';

/**
 * Pattern Management Server Actions
 *
 * Server actions for managing AI-detected patterns:
 * - Fetching team/player patterns
 * - Validating patterns (coach confirms AI finding)
 * - Dismissing patterns (pattern is incorrect)
 * - Resolving patterns (issue has been addressed)
 * - Creating focus areas from patterns
 */

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import type { MinedPattern, PatternTrend } from '@/lib/coachhelm/v2/types';
import { logServerError } from '@/lib/server-error-logger';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// OWNERSHIP HELPER
// ============================================================================

/**
 * Verify the current user is a coach staffing a team this pattern's player
 * belongs to. Used by every pattern-mutation action — without it, any
 * authenticated coach could mutate any player's patterns by guessing an id.
 */
async function verifyPatternAccess(
  patternId: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<{ allowed: boolean; playerId?: string }> {
  const { data: pattern } = await supabase
    .from('golf_patterns_v2')
    .select('player_id')
    .eq('id', patternId)
    .maybeSingle();

  if (!pattern?.player_id) return { allowed: false };

  const access = await verifyPlayerAccess(pattern.player_id, userId, supabase);
  return { allowed: access.allowed, playerId: pattern.player_id };
}

// ============================================================================
// TYPES
// ============================================================================

/** Pattern lifecycle state */
export type PatternLifecycleState =
  | 'detected'    // AI just found it
  | 'confirmed'   // Coach validated it's real
  | 'addressed'   // Working on fixing it
  | 'resolved'    // Issue fixed
  | 'dismissed';  // Pattern was incorrect/irrelevant

/** Pattern severity level */
export type PatternSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Pattern filter options */
export interface PatternFilters {
  playerId?: string;
  patternType?: string;
  lifecycleState?: PatternLifecycleState;
  severity?: PatternSeverity;
  isActive?: boolean;
  /**
   * Include low-value `contextual` patterns (avg −0.33 strokes — the
   * 99.79%-of-rows noise tier). DEFAULT false: by default `getTeamPatterns`
   * EXCLUDES contextual patterns at the query so the ~13k-row contextual flood
   * never transits the wire nor builds a 13k-row client list. A "Show contextual"
   * toggle can pass `true` to request them. Honest: nothing is permanently
   * hidden — it is one opt-in away, and `contextualHidden` reports the count.
   * Ignored when an explicit `patternType` filter is supplied.
   */
  includeContextual?: boolean;
  /**
   * Hard cap on returned rows (perf guard). Defaults to `PATTERNS_DEFAULT_LIMIT`.
   * Applied AFTER contextual suppression + the stroke_impact-desc order, so the
   * cap keeps the highest-signal rows.
   */
  limit?: number;
}

/** Default row cap for getTeamPatterns — keeps the highest-signal patterns and
 *  stops the contextual flood from building a multi-thousand-row client list.
 *  NOT exported: a 'use server' module may only export async functions, so this
 *  stays a module-internal const (only referenced inside getTeamPatterns). */
const PATTERNS_DEFAULT_LIMIT = 200;

/**
 * Pattern with extended metadata for UI.
 *
 * `lifecycleState` intersects the base `MinedPattern.lifecycleState`
 * (from coachhelm/v2/types) with this file's richer lifecycle enum.
 * The base type is narrower, so we mirror its unions plus our extra
 * states (`confirmed`, `addressed`) while staying compatible.
 */
export interface ExtendedPattern extends Omit<MinedPattern, 'lifecycleState'> {
  lifecycleState: PatternLifecycleState;
  severity: PatternSeverity;
  coachNotes?: string;
  validatedAt?: string;
  validatedBy?: string;
  addressedAt?: string;
  resolvedAt?: string;
  dismissedAt?: string;
  dismissedReason?: string;
  playerName?: string;
  playerAvatarUrl?: string | null;
}

/** Pattern validation input */
export interface PatternValidation {
  isAccurate: boolean;
  severity: PatternSeverity;
  notes?: string;
  createFocusArea?: boolean;
}

// ============================================================================
// DATABASE ROW TYPE
// ============================================================================

interface PatternDbRow {
  id: string;
  player_id: string;
  pattern_type: string;
  conditions: unknown;
  outcome: unknown;
  support: number;
  confidence: number;
  lift: number;
  conviction: number;
  stroke_impact: number;
  actionability: number;
  sample_size: number;
  first_detected: string;
  last_occurrence: string;
  occurrence_count: number;
  trend: string;
  is_active: boolean;
  lifecycle_state?: string;
  severity?: string;
  // REAL golf_patterns_v2 columns (verified live). The historical
  // `coach_notes` / `validated_at` / `validated_by` / `addressed_at` columns
  // never existed — writing them threw Postgres 42703 (undefined_column) and
  // reading them always yielded undefined. Map to what the table actually has:
  //   • resolution_notes      ← coach-entered notes (validate/address/resolve)
  //   • validation_date       ← when the coach confirmed (was validated_at)
  //   • validator_coach_id    ← who confirmed (was validated_by)
  //   • validated_by_coach    ← boolean confirmation flag
  // There is NO `addressed_at` column — "addressed" lives purely in
  // lifecycle_state.
  resolution_notes?: string;
  validation_date?: string;
  validator_coach_id?: string;
  validated_by_coach?: boolean;
  resolved_at?: string;
  dismissed_at?: string;
  dismissed_reason?: string;
  metadata?: {
    description?: string;
    recommendation?: string;
  };
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Calculate severity from stroke impact */
function calculateSeverity(strokeImpact: number): PatternSeverity {
  const absImpact = Math.abs(strokeImpact);
  if (absImpact >= 2.5) return 'critical';
  if (absImpact >= 1.5) return 'high';
  if (absImpact >= 0.8) return 'medium';
  return 'low';
}

/** Transform database row to ExtendedPattern */
function transformPatternRow(
  row: PatternDbRow,
  playerInfo?: { first_name?: string | null; last_name?: string | null; avatar_url?: string | null }
): ExtendedPattern {
  const playerName = playerInfo
    ? [playerInfo.first_name, playerInfo.last_name].filter(Boolean).join(' ').trim()
    : undefined;

  return {
    id: row.id,
    playerId: row.player_id,
    patternType: row.pattern_type as MinedPattern['patternType'],
    conditions: row.conditions as MinedPattern['conditions'],
    outcome: row.outcome as MinedPattern['outcome'],
    support: row.support,
    confidence: row.confidence,
    lift: row.lift,
    conviction: row.conviction,
    strokeImpact: row.stroke_impact,
    actionability: row.actionability,
    sampleSize: row.sample_size,
    firstDetected: row.first_detected,
    lastOccurrence: row.last_occurrence,
    occurrenceCount: row.occurrence_count,
    trend: row.trend as PatternTrend,
    isActive: row.is_active,
    description: row.metadata?.description,
    recommendation: row.metadata?.recommendation,
    lifecycleState: (row.lifecycle_state as PatternLifecycleState) || 'detected',
    severity: (row.severity as PatternSeverity) || calculateSeverity(row.stroke_impact),
    // Read from the REAL columns. `addressedAt` has no backing column (the
    // "addressed" state is expressed only via lifecycle_state), so it stays
    // undefined — the UI derives "in progress" from lifecycleState anyway.
    coachNotes: row.resolution_notes,
    validatedAt: row.validation_date,
    validatedBy: row.validator_coach_id,
    addressedAt: undefined,
    resolvedAt: row.resolved_at,
    dismissedAt: row.dismissed_at,
    dismissedReason: row.dismissed_reason,
    playerName,
    playerAvatarUrl: playerInfo?.avatar_url,
  };
}

// ============================================================================
// GET TEAM PATTERNS
// ============================================================================

export async function getTeamPatterns(
  filters?: PatternFilters
): Promise<{
  success: boolean;
  patterns?: ExtendedPattern[];
  error?: string;
  /**
   * Honest read-time counts so the UI can show a "Showing N high-signal
   * patterns; X contextual hidden" banner without a second round trip.
   *  • returned          — rows actually shipped (after suppression + cap)
   *  • contextualHidden  — contextual rows excluded by the default suppression
   *                        (0 when includeContextual is true)
   *  • capped            — true when the limit clipped additional eligible rows
   */
  counts?: {
    returned: number;
    contextualHidden: number;
    capped: boolean;
  };
}> {
  const supabase = await createClient();

  try {
    // Get current coach and team
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

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

    if (!teamId) {
      return { success: false, error: 'No team assigned' };
    }

    // Get active team player IDs
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    const playerIds = (teamMembers || []).map(m => m.player_id);
    if (playerIds.length === 0) {
      return {
        success: true,
        patterns: [],
        counts: { returned: 0, contextualHidden: 0, capped: false },
      };
    }

    // Get players for names/avatars
    const { data: players } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url')
      .in('id', playerIds);

    const playerMap = new Map(
      (players || []).map(p => [p.id, p])
    );

    // ── Read-time suppression + bound (the pattern-noise fix) ───────────────
    // golf_patterns_v2 holds ~13.4k rows for the demo team, 99.79% of which are
    // low-value `contextual` patterns (avg −0.33 strokes) that bury the ~27
    // real-signal conditional/compound patterns. By DEFAULT we exclude
    // contextual at the query and cap the result, so the flood never transits
    // the wire nor builds a multi-thousand-row client list. A "Show contextual"
    // toggle opts back in via `filters.includeContextual`. This is read-only —
    // NO DB writes, no severity mutation; ranking is derived downstream from
    // genuine stroke_impact + pattern_type.
    //
    // Suppression is skipped when the caller asked for a specific patternType
    // (e.g. patternType:'contextual' explicitly wants them) or set
    // includeContextual:true.
    const suppressContextual =
      !filters?.includeContextual && !filters?.patternType;
    const limit = Math.max(
      1,
      filters?.limit ?? PATTERNS_DEFAULT_LIMIT,
    );

    // Build patterns query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from('golf_patterns_v2' as any) as any)
      .select('*')
      .in('player_id', playerIds);

    // Apply filters
    if (filters?.playerId) {
      query = query.eq('player_id', filters.playerId);
    }
    if (filters?.patternType) {
      query = query.eq('pattern_type', filters.patternType);
    }
    if (filters?.lifecycleState) {
      query = query.eq('lifecycle_state', filters.lifecycleState);
    }
    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }
    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }
    if (suppressContextual) {
      query = query.neq('pattern_type', 'contextual');
    }

    // Highest stroke_impact first, then cap. The cap is applied AFTER the order
    // so the rows we keep are the most-impactful eligible patterns.
    query = query
      .order('stroke_impact', { ascending: false })
      .limit(limit);

    // Honest count of the contextual rows the default suppression is hiding —
    // a head-only count query (no rows fetched). Only meaningful while we are
    // actually suppressing; otherwise 0.
    let contextualHidden = 0;
    if (suppressContextual) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let countQuery = (supabase.from('golf_patterns_v2' as any) as any)
        .select('id', { count: 'exact', head: true })
        .in('player_id', playerIds)
        .eq('pattern_type', 'contextual');
      if (filters?.playerId) countQuery = countQuery.eq('player_id', filters.playerId);
      if (filters?.lifecycleState) countQuery = countQuery.eq('lifecycle_state', filters.lifecycleState);
      if (filters?.severity) countQuery = countQuery.eq('severity', filters.severity);
      if (filters?.isActive !== undefined) countQuery = countQuery.eq('is_active', filters.isActive);
      const { count } = await countQuery;
      contextualHidden = count ?? 0;
    }

    const { data: patterns, error } = await query;

    if (error) {
      await logServerError(`getTeamPatterns query failed: ${error.message}`, {
        action: 'getTeamPatterns',
        featureArea: 'pattern_management',
        extra: { errorCode: error.code },
      });
      return {
        success: true,
        patterns: [],
        counts: { returned: 0, contextualHidden: 0, capped: false },
      };
    }

    const transformedPatterns = (patterns || []).map((row: PatternDbRow) =>
      transformPatternRow(row, playerMap.get(row.player_id))
    );

    return {
      success: true,
      patterns: transformedPatterns,
      counts: {
        returned: transformedPatterns.length,
        contextualHidden,
        // We over-fetched the cap by exactly the cap; if we hit it, more
        // non-contextual rows were eligible than shipped.
        capped: transformedPatterns.length >= limit,
      },
    };
  } catch (error) {
    await logServerError(`getTeamPatterns failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getTeamPatterns',
      featureArea: 'pattern_management',
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET PLAYER PATTERNS (WITH EXTENDED DATA) — REMOVED 2026-04-27
// ============================================================================
// `getPlayerPatternsExtended` was unused (no callers anywhere in src/ or
// src/test). Removed to keep the public surface area honest. If a per-player
// patterns view ships in the future, reach for `getTeamPatterns({ playerId })`
// instead — same shape, narrower query.

// ============================================================================
// VALIDATE PATTERN
// ============================================================================

export async function validatePattern(
  patternId: string,
  validation: PatternValidation
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const ownership = await verifyPatternAccess(patternId, user.id, supabase);
    if (!ownership.allowed) {
      return { success: false, error: 'Forbidden' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    const patternsTable = fromUntyped(supabase, 'golf_patterns_v2');

    // Write the REAL golf_patterns_v2 columns. validation_date /
    // validator_coach_id / validated_by_coach replace the never-existent
    // validated_at / validated_by; notes go to resolution_notes. Using the old
    // names threw Postgres 42703 and the validation silently no-op'd.
    const updateData: Record<string, unknown> = {
      lifecycle_state: validation.isAccurate ? 'confirmed' : 'dismissed',
      severity: validation.severity,
      validated_by_coach: validation.isAccurate,
      validation_date: new Date().toISOString(),
      validator_coach_id: coach.id,
      updated_at: new Date().toISOString(),
    };

    if (validation.notes) {
      updateData.resolution_notes = validation.notes;
    }

    if (!validation.isAccurate) {
      updateData.dismissed_at = new Date().toISOString();
      updateData.dismissed_reason = 'Coach marked as inaccurate';
      updateData.is_active = false;
    }

    const { error } = await patternsTable
      .update(updateData)
      .eq('id', patternId);

    if (error) {
      await logServerError(`validatePattern update failed: ${error.message}`, {
        action: 'validatePattern',
        featureArea: 'pattern_management',
        extra: { patternId, errorCode: error.code },
      });
      return { success: false, error: 'Failed to validate pattern' };
    }

    // Optionally create focus area from pattern
    if (validation.isAccurate && validation.createFocusArea) {
      await createFocusAreaFromPatternInternal(patternId, coach.id);
    }

    revalidatePath('/golf/dashboard/patterns');
    return { success: true };
  } catch (error) {
    await logServerError(`validatePattern failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'validatePattern',
      featureArea: 'pattern_management',
      extra: { patternId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// DISMISS PATTERN
// ============================================================================

export async function dismissPattern(
  patternId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const ownership = await verifyPatternAccess(patternId, user.id, supabase);
    if (!ownership.allowed) {
      return { success: false, error: 'Forbidden' };
    }

    const patternsTable = supabase.from('golf_patterns_v2');

    const { error } = await patternsTable
      .update({
        lifecycle_state: 'dismissed',
        dismissed_at: new Date().toISOString(),
        dismissed_reason: reason || 'Dismissed by coach',
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patternId);

    if (error) {
      await logServerError(`dismissPattern update failed: ${error.message}`, {
        action: 'dismissPattern',
        featureArea: 'pattern_management',
        extra: { patternId, errorCode: error.code },
      });
      return { success: false, error: 'Failed to dismiss pattern' };
    }

    revalidatePath('/golf/dashboard/patterns');
    return { success: true };
  } catch (error) {
    await logServerError(`dismissPattern failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'dismissPattern',
      featureArea: 'pattern_management',
      extra: { patternId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// MARK PATTERN AS ADDRESSED
// ============================================================================

export async function markPatternAddressed(
  patternId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const ownership = await verifyPatternAccess(patternId, user.id, supabase);
    if (!ownership.allowed) {
      return { success: false, error: 'Forbidden' };
    }

    const patternsTable = fromUntyped(supabase, 'golf_patterns_v2');

    // "Addressed" is tracked purely via lifecycle_state — there is no
    // addressed_at column (writing it threw Postgres 42703). Notes go to the
    // real resolution_notes column (was the non-existent coach_notes).
    const updateData: Record<string, unknown> = {
      lifecycle_state: 'addressed',
      updated_at: new Date().toISOString(),
    };

    if (notes) {
      updateData.resolution_notes = notes;
    }

    const { error } = await patternsTable
      .update(updateData)
      .eq('id', patternId);

    if (error) {
      await logServerError(`markPatternAddressed update failed: ${error.message}`, {
        action: 'markPatternAddressed',
        featureArea: 'pattern_management',
        extra: { patternId, errorCode: error.code },
      });
      return { success: false, error: 'Failed to update pattern' };
    }

    revalidatePath('/golf/dashboard/patterns');
    return { success: true };
  } catch (error) {
    await logServerError(`markPatternAddressed failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'markPatternAddressed',
      featureArea: 'pattern_management',
      extra: { patternId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// RESOLVE PATTERN
// ============================================================================

export async function resolvePattern(
  patternId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const ownership = await verifyPatternAccess(patternId, user.id, supabase);
    if (!ownership.allowed) {
      return { success: false, error: 'Forbidden' };
    }

    const patternsTable = fromUntyped(supabase, 'golf_patterns_v2');

    const updateData: Record<string, unknown> = {
      lifecycle_state: 'resolved',
      resolved_at: new Date().toISOString(),
      is_active: false,
      updated_at: new Date().toISOString(),
    };

    // Notes go to the real resolution_notes column (was the non-existent
    // coach_notes, which threw Postgres 42703).
    if (notes) {
      updateData.resolution_notes = notes;
    }

    const { error } = await patternsTable
      .update(updateData)
      .eq('id', patternId);

    if (error) {
      await logServerError(`resolvePattern update failed: ${error.message}`, {
        action: 'resolvePattern',
        featureArea: 'pattern_management',
        extra: { patternId, errorCode: error.code },
      });
      return { success: false, error: 'Failed to resolve pattern' };
    }

    revalidatePath('/golf/dashboard/patterns');
    return { success: true };
  } catch (error) {
    await logServerError(`resolvePattern failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'resolvePattern',
      featureArea: 'pattern_management',
      extra: { patternId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// CREATE FOCUS AREA FROM PATTERN
// ============================================================================

/**
 * Maps a pattern_type to a golf_player_focus_areas.area_type enum value.
 * Best-effort — unknown patterns fall back to 'general'.
 */
function derivePatternAreaType(patternType: string | null | undefined, field?: string | null): string {
  const haystack = `${patternType ?? ''} ${field ?? ''}`.toLowerCase();
  if (haystack.includes('putt')) return 'putting';
  if (haystack.includes('gir') || haystack.includes('approach')) return 'approach';
  if (haystack.includes('drive') || haystack.includes('fairway')) return 'driving';
  if (haystack.includes('chip') || haystack.includes('short')) return 'short_game';
  if (haystack.includes('mental') || haystack.includes('pressure')) return 'mental';
  return 'general';
}

async function createFocusAreaFromPatternInternal(
  patternId: string,
  coachId: string
): Promise<{ success: boolean; focusAreaId?: string; error?: string }> {
  const supabase = await createClient();

  try {
    const patternsTable = supabase.from('golf_patterns_v2');

    const { data: pattern, error: patternError } = await patternsTable
      .select('*')
      .eq('id', patternId)
      .single();

    if (patternError || !pattern) {
      return { success: false, error: 'Pattern not found' };
    }

    const typedPattern = pattern as PatternDbRow;

    // Determine area_type (enum) from the pattern type + first condition field.
    const conditions = typedPattern.conditions as Array<{ field?: string; label?: string }> | undefined;
    const condition = conditions?.[0];
    const areaType = derivePatternAreaType(typedPattern.pattern_type, condition?.field);

    // Create focus area. Live schema columns (LIVE-8):
    //   area_type, player_id, coach_id, title, description, priority,
    //   status, from_insight_id, from_review_id, target_metric, target_value,
    //   current_value, notes, progress_notes (jsonb), review_context, team_id,
    //   started_at, completed_at, created_at, updated_at
    // NOT present: category, source, source_id, created_by, target_improvement.
    const focusAreasTable = supabase.from('golf_player_focus_areas');

    const meta = (typedPattern.metadata as Record<string, unknown> | null) ?? null;
    const metaDescription = typeof meta?.description === 'string' ? meta.description : null;
    const metaRecommendation = typeof meta?.recommendation === 'string' ? meta.recommendation : null;

    const { data: focusArea, error: insertError } = await focusAreasTable
      .insert({
        player_id: typedPattern.player_id,
        coach_id: coachId,
        area_type: areaType,
        title: metaDescription || 'Pattern-Based Focus Area',
        description: metaRecommendation || 'Work on this area based on detected pattern.',
        priority: typedPattern.stroke_impact >= 1.5 ? 1 : typedPattern.stroke_impact >= 1 ? 2 : 3,
        status: 'active',
        // Thread pattern context into the notes / progress_notes jsonb so
        // the UI can show the source without a schema extension.
        progress_notes: {
          source_pattern_id: patternId,
          target_improvement: `Reduce ${Math.abs(typedPattern.stroke_impact).toFixed(1)} strokes`,
        },
      })
      .select('id')
      .single();

    if (insertError) {
      await logServerError(`createFocusAreaFromPatternInternal insert failed: ${insertError.message}`, {
        action: 'createFocusAreaFromPatternInternal',
        featureArea: 'pattern_management',
        extra: { patternId, coachId, errorCode: insertError.code },
      });
      return { success: false, error: 'Failed to create focus area' };
    }

    return { success: true, focusAreaId: focusArea?.id };
  } catch (error) {
    await logServerError(`createFocusAreaFromPatternInternal failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'createFocusAreaFromPatternInternal',
      featureArea: 'pattern_management',
      extra: { patternId, coachId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// `createFocusAreaFromPattern` and `updatePatternNotes` removed 2026-04-27 —
// orphan exports with no UI/server callers. The pattern→focus-area path is
// driven by `createFocusAreaFromPatternInternal` (used by validate-pattern).

// ============================================================================
// GET PATTERN STATS
// ============================================================================

export async function getPatternStats(): Promise<{
  success: boolean;
  stats?: {
    total: number;
    detected: number;
    confirmed: number;
    addressed: number;
    resolved: number;
    dismissed: number;
    byPlayer: Array<{
      playerId: string;
      playerName: string;
      count: number;
    }>;
    byType: Record<string, number>;
    bySeverity: Record<PatternSeverity, number>;
  };
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

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

    if (!teamId) {
      return { success: false, error: 'No team assigned' };
    }

    // Get active team player IDs
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    const playerIds = (teamMembers || []).map(m => m.player_id);
    if (playerIds.length === 0) {
      return {
        success: true,
        stats: {
          total: 0,
          detected: 0,
          confirmed: 0,
          addressed: 0,
          resolved: 0,
          dismissed: 0,
          byPlayer: [],
          byType: {},
          bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
        },
      };
    }

    // Get players for names
    const { data: players } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', playerIds);

    const playerMap = new Map(
      (players || []).map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()])
    );

    // Get all patterns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: patterns, error } = await (supabase.from('golf_patterns_v2' as any) as any)
      .select('player_id, pattern_type, lifecycle_state, severity, stroke_impact')
      .in('player_id', playerIds);

    if (error) {
      await logServerError(`getPatternStats query failed: ${error.message}`, {
        action: 'getPatternStats',
        featureArea: 'pattern_management',
        extra: { errorCode: error.code },
      });
      return { success: true, stats: {
        total: 0,
        detected: 0,
        confirmed: 0,
        addressed: 0,
        resolved: 0,
        dismissed: 0,
        byPlayer: [],
        byType: {},
        bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      }};
    }

    // Calculate stats
    const typedPatterns = (patterns || []) as Array<{
      player_id: string;
      pattern_type: string;
      lifecycle_state?: string;
      severity?: string;
      stroke_impact: number;
    }>;

    const stats = {
      total: typedPatterns.length,
      detected: typedPatterns.filter(p => !p.lifecycle_state || p.lifecycle_state === 'detected').length,
      confirmed: typedPatterns.filter(p => p.lifecycle_state === 'confirmed').length,
      addressed: typedPatterns.filter(p => p.lifecycle_state === 'addressed').length,
      resolved: typedPatterns.filter(p => p.lifecycle_state === 'resolved').length,
      dismissed: typedPatterns.filter(p => p.lifecycle_state === 'dismissed').length,
      byPlayer: [] as Array<{ playerId: string; playerName: string; count: number }>,
      byType: {} as Record<string, number>,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 } as Record<PatternSeverity, number>,
    };

    // Count by player
    const playerCounts = new Map<string, number>();
    for (const pattern of typedPatterns) {
      playerCounts.set(pattern.player_id, (playerCounts.get(pattern.player_id) || 0) + 1);
    }
    stats.byPlayer = Array.from(playerCounts.entries()).map(([playerId, count]) => ({
      playerId,
      playerName: playerMap.get(playerId) || 'Unknown',
      count,
    }));

    // Count by type
    for (const pattern of typedPatterns) {
      stats.byType[pattern.pattern_type] = (stats.byType[pattern.pattern_type] || 0) + 1;
    }

    // Count by severity
    for (const pattern of typedPatterns) {
      const severity = (pattern.severity as PatternSeverity) || calculateSeverity(pattern.stroke_impact);
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
    }

    return { success: true, stats };
  } catch (error) {
    await logServerError(`getPatternStats failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getPatternStats',
      featureArea: 'pattern_management',
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}
