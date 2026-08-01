'use server';

// ============================================================================
// COACH ALERT CENTER - SERVER ACTIONS
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { coachHelmIntelligence } from '@/lib/coachhelm/v2';
import { logServerError } from '@/lib/server-error-logger';
import type { Database } from '@/lib/types/database';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';
import { gateCoachHelmEngineCall } from '@/lib/auth/action-rate-limit';

type CoachInsightInsert = Database['public']['Tables']['golf_coach_insights']['Insert'];

/**
 * Alert level + row shape returned by this action file. Extracted here (Wave
 * W1, 2026-07-09) when the legacy `AlertCard`/`CoachAlertCenter` components
 * that used to co-own this type were deleted — Fairway's `FairwayCoachHelmSignals`
 * is now the only renderer of the coach alerts surface and reads evidence-backed
 * insights directly (`getInsightsForCoachWithMeta`), not this shape. This file
 * keeps constructing `CoachAlert` rows for `generateAlerts`/`getAlertCounts`.
 */
export type AlertLevel = 'critical' | 'warning' | 'info' | 'suggestion';

export interface CoachAlert {
  id: string;
  playerId: string;
  playerName: string;
  playerAvatarUrl?: string | null;
  level: AlertLevel;
  title: string;
  message: string;
  callToAction?: string;
  createdAt: string;
  acknowledgedAt?: string | null;
  insightType?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// GET COACH ALERTS (internal — consumed only by generateAlerts below)
// ----------------------------------------------------------------------------
// Not exported: the live triage path reads insights via insight-delivery.ts /
// insights.ts (acknowledgeInsight), so this is no longer a public server
// action. It stays as a private helper because generateAlerts re-fetches the
// current list through it.
// ============================================================================

async function getCoachAlerts(
  coachId: string,
  _teamId: string,  // Reserved for future use
  options?: {
    includeAcknowledged?: boolean;
    limit?: number;
  }
): Promise<{
  success: boolean;
  alerts?: CoachAlert[];
  error?: string;
}> {
  const supabase = await createClient();

  // Auth check: verify user owns this coach record
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not authorized to view these alerts' };
  }

  try {
    // Build query. Apply the SAME product-visibility contract every coach
    // surface uses (P2 legacy-surface): this flag-off Alert Center must NOT
    // render stale v2 phantoms or archived/dismissed rows if the redesign flag
    // is ever flipped off. `.eq('dismissed', false)` alone lets the 42-stroke
    // v2 phantoms + archived-active rows through.
    let query = applyInsightVisibility(
      supabase
        .from('golf_coach_insights')
        .select(`
          id,
          player_id,
          insight_type,
          title,
          content,
          priority,
          status,
          acknowledged_at,
          dismissed,
          created_at,
          metadata,
          player:golf_players(id, first_name, last_name, avatar_url)
        `)
        .eq('coach_id', coachId)
        .eq('dismissed', false),
    ).order('created_at', { ascending: false });

    // Filter acknowledged if not including them
    if (!options?.includeAcknowledged) {
      query = query.is('acknowledged_at', null);
    }

    // Apply limit
    if (options?.limit) {
      query = query.limit(options.limit);
    } else {
      query = query.limit(20); // Default limit
    }

    const { data, error } = await query;

    if (error) {
      await logServerError(`getCoachAlerts failed: ${error.message}`, {
        action: 'getCoachAlerts',
        featureArea: 'alerts',
        extra: { coachId, errorCode: error.code },
      });
      return { success: false, error: 'Failed to fetch alerts' };
    }

    // Transform to CoachAlert format
    const alerts: CoachAlert[] = (data || []).map((insight) => {
      // Cast needed: Supabase join returns player as unknown object type, not typed relation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = insight.player as any;
      const playerName = player
        ? `${player.first_name || ''} ${player.last_name || ''}`.trim()
        : 'Unknown Player';

      return {
        id: insight.id,
        playerId: insight.player_id || '',
        playerName,
        playerAvatarUrl: player?.avatar_url || null,
        level: mapPriorityToLevel(insight.priority),
        title: insight.title,
        message: insight.content || insight.title,
        callToAction: (insight.metadata as Record<string, string>)?.callToAction,
        createdAt: insight.created_at || new Date().toISOString(),
        acknowledgedAt: insight.acknowledged_at,
        insightType: insight.insight_type,
        metadata: insight.metadata as Record<string, unknown>,
      };
    });

    return { success: true, alerts };
  } catch (error) {
    await logServerError(`getCoachAlerts failed: ${describeError(error)}`, {
      action: 'getCoachAlerts',
      featureArea: 'alerts',
      extra: { coachId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET ALERT COUNTS
// ============================================================================

const EMPTY_ALERT_COUNTS = { critical: 0, warning: 0, info: 0, total: 0 };

async function getAlertCountsImpl(
  coachId: string
): Promise<{
  success: boolean;
  counts?: { critical: number; warning: number; info: number; total: number };
  error?: string;
  /**
   * True when the caller has no live session/authorization for this coach
   * record. The 45s badge poll in notification-badge-context.tsx keeps this
   * action warm for the lifetime of an open tab, so it routinely outlives a
   * logout or a session/idle-timeout expiry — that's an expected client
   * state, not an incident. Return a silent, honest empty result (no
   * `error`, no thrown/logged failure) instead of `{success:false}`, which
   * `observeActionSoftFailure` would otherwise persist to the Bridge on
   * every single poll. The flag lets the client stop polling once it learns
   * the session is gone, rather than repeating the same expected miss
   * forever.
   */
  authExpired?: boolean;
}> {
  const supabase = await createClient();

  // Auth check: verify user owns this coach record
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: true, counts: EMPTY_ALERT_COUNTS, authExpired: true };
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: true, counts: EMPTY_ALERT_COUNTS, authExpired: true };
  }

  try {
    // Apply the SAME product-visibility contract every coach surface uses
    // (P1/P2): the badge must NOT count stale v2 rows or rows the engine
    // archived (v3 stale-scope retraction leaves status='active' but flips
    // lifecycle_state='archived', so a lifecycle filter is load-bearing —
    // `.eq('status','active')` alone lets all 64 archived-active rows through).
    const { data, error } = await applyInsightVisibility(
      supabase
        .from('golf_coach_insights')
        .select('priority')
        .eq('coach_id', coachId)
        .eq('dismissed', false)
        .eq('status', 'active'),
    );

    if (error) {
      return { success: false, error: 'Failed to fetch alert counts' };
    }

    const counts = {
      critical: 0,
      warning: 0,
      info: 0,
      total: data?.length || 0,
    };

    (data || []).forEach((insight) => {
      // The live priority enum is low | medium | high | urgent. `urgent` is the
      // top severity and MUST land in the critical bucket — the old check
      // (`'critical' || 'high'`) tested a 'critical' value that the enum never
      // emits and silently dropped every 'urgent' row into INFO, undercounting
      // the badge's critical tier.
      if (insight.priority === 'urgent' || insight.priority === 'high') {
        counts.critical++;
      } else if (insight.priority === 'medium') {
        counts.warning++;
      } else {
        counts.info++;
      }
    });

    return { success: true, counts };
  } catch (error) {
    await logServerError(`getAlertCounts failed: ${describeError(error)}`, {
      action: 'getAlertCounts',
      featureArea: 'alerts',
      extra: { coachId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGetAlertCounts = withAdminObserved(
  'getAlertCounts',
  { sport: 'golf', feature: 'alerts_system' },
  getAlertCountsImpl,
);
export async function getAlertCounts(
  coachId: string
): Promise<{
  success: boolean;
  counts?: { critical: number; warning: number; info: number; total: number };
  error?: string;
  authExpired?: boolean;
}> {
  return observedGetAlertCounts(coachId);
}

// ============================================================================
// GENERATE ALERTS (Scan team and create new alerts)
// ============================================================================

/**
 * P2-14 / P2-19 — count the rows the CANONICAL V3 feed would surface for this
 * coach right now, applying the SAME visibility contract
 * (`applyInsightVisibility`) the live read uses. RLS scopes the read to teams
 * the coach staffs, so no coach_id filter is needed. Used to compute the honest
 * "visible delta" a Scan Team reports, instead of the raw insert count — which
 * over-claimed because freshly-written rows that aren't V3-visible never reach
 * the feed. Returns null when the count query errors so the caller can fall
 * back rather than report a fabricated number.
 */
async function countVisibleCoachInsights(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number | null> {
  const { count, error } = await applyInsightVisibility(
    supabase
      .from('golf_coach_insights')
      .select('id', { count: 'exact', head: true })
      .not('evidence', 'is', null),
  );
  if (error) return null;
  return count ?? 0;
}

async function generateAlertsImpl(
  coachId: string,
  teamId: string
): Promise<{
  success: boolean;
  alerts?: CoachAlert[];
  generated?: number;
  error?: string;
}> {
  const supabase = await createClient();

  // Auth check: verify user owns this coach record
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not authorized to generate alerts for this coach' };
  }

  // DS: generateAlerts fans coachHelmIntelligence.analyzePlayer (full v2
  // orchestrator, multi-second/table-writing) out across the entire active
  // roster with no gate — a tight client loop can hold a function instance
  // hostage. Same 5/min/user gate as every other CoachHelm engine entrypoint.
  const rateLimit = await gateCoachHelmEngineCall(user.id);
  if (!rateLimit.allowed) {
    return { success: false, error: rateLimit.error };
  }

  try {
    // P2-14 / P2-19: the canonical V3 feed (insight-delivery.getInsightsForCoach
    // via applyInsightVisibility) only surfaces rows stamped engine_version='v3'
    // OR a `v3:` signature AND in a visible lifecycle_state. Historically the
    // rows generateAlerts wrote carried NEITHER, so a coach saw a "generated N"
    // success while the V3 feed never reflected those rows. We now (a) stamp the
    // generated rows so they ARE V3-visible, (b) measure the count as the visible
    // delta from the canonical read (not newAlerts.length), and (c) fail the
    // action when the insert fails instead of swallowing it. Capture the
    // pre-scan visible count as the baseline for the honest delta.
    const visibleBefore = await countVisibleCoachInsights(supabase);

    // Get active players on the team
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    const playerIds = (teamMembers || []).map((m) => m.player_id);

    const { data: players } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url')
      .in('id', playerIds);

    if (!players || players.length === 0) {
      return { success: true, alerts: [], generated: 0 };
    }

    // Analyze each player in parallel
    const analysisPromises = players.map(async (player) => {
      try {
        const analysis = await coachHelmIntelligence.analyzePlayer(player.id, {
          includePatterns: true,
          includePredictions: true,
          depth: 'standard',
        });

        return {
          player,
          analysis,
          success: true,
        };
      } catch (error) {
        await logServerError(`generateAlerts player analysis failed: ${describeError(error)}`, {
          action: 'generateAlerts.analyzePlayer',
          featureArea: 'alerts',
          playerId: player.id,
        });
        return { player, analysis: null, success: false };
      }
    });

    const results = await Promise.all(analysisPromises);

    // Generate alerts from analysis results
    const newAlerts: CoachInsightInsert[] = [];

    for (const result of results) {
      if (!result.success || !result.analysis) continue;

      const { player, analysis } = result;
      const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim();

      // Check alert level from analysis
      if (analysis.alertLevel === 'critical' || analysis.alertLevel === 'warning') {
        const primaryInsight = analysis.primaryInsight;

        newAlerts.push({
          coach_id: coachId,
          player_id: player.id,
          team_id: teamId,
          insight_type: 'performance_alert',
          title: primaryInsight.headline || `${playerName} needs attention`,
          content: primaryInsight.body || 'Performance analysis detected an issue.',
          priority: analysis.alertLevel === 'critical' ? 'high' : 'medium',
          status: 'active',
          metadata: {
            callToAction: primaryInsight.callToAction,
            tone: primaryInsight.tone,
            confidence: primaryInsight.confidence,
            patterns: analysis.patterns.slice(0, 3).map((p) => ({
              id: p.id,
              description: p.description,
              strokeImpact: p.strokeImpact,
            })),
            recommendations: analysis.recommendations.slice(0, 3),
          },
        });
      }

      // Add alerts for concerning patterns
      const concerningPatterns = analysis.patterns.filter(
        (p) => p.strokeImpact > 1.5 && p.confidence > 0.7
      );

      for (const pattern of concerningPatterns.slice(0, 2)) {
        newAlerts.push({
          coach_id: coachId,
          player_id: player.id,
          team_id: teamId,
          insight_type: 'pattern_detected',
          title: `Pattern detected for ${playerName}`,
          content: pattern.description || 'A significant performance pattern was detected.',
          priority: pattern.strokeImpact > 2 ? 'high' : 'medium',
          status: 'active',
          metadata: {
            patternId: pattern.id,
            strokeImpact: pattern.strokeImpact,
            confidence: pattern.confidence,
            callToAction: pattern.recommendation,
          },
        });
      }

      // Add positive alerts (streaks, improvements)
      if (analysis.alertLevel === 'info' && analysis.insights.length > 0) {
        const positiveInsight = analysis.insights.find(
          (i) => i.tone === 'celebratory' || i.tone === 'encouraging'
        );

        if (positiveInsight) {
          newAlerts.push({
            coach_id: coachId,
            player_id: player.id,
            team_id: teamId,
            insight_type: 'positive_highlight',
            title: positiveInsight.headline || `${playerName} is doing great!`,
            content: positiveInsight.body || 'Positive performance trend detected.',
            priority: 'low',
            status: 'active',
            metadata: {
              callToAction: positiveInsight.callToAction,
              tone: positiveInsight.tone,
              confidence: positiveInsight.confidence,
            },
          });
        }
      }
    }

    // Insert new alerts
    if (newAlerts.length > 0) {
      // `newAlerts` already matches the `golf_coach_insights` Insert type
      // (coach_id, player_id, team_id, insight_type, title, content, priority,
      // status, metadata). Types regen after Phase 1 put this row shape in
      // `src/lib/types/database.ts`, so the cast is no longer needed.
      const { error: insertError } = await supabase
        .from('golf_coach_insights')
        .insert(newAlerts);

      if (insertError) {
        await logServerError(`generateAlerts insert failed: ${insertError.message}`, {
          action: 'generateAlerts.insert',
          featureArea: 'alerts',
          extra: { coachId, teamId, alertCount: newAlerts.length, errorCode: insertError.code },
        });
        // P2-14 acceptance test 2: an insert failure must return an error, NOT
        // a success that reports the requested count. Previously this swallowed
        // the error and reported `generated: newAlerts.length` — a false claim.
        return { success: false, error: 'Could not save the scan results. Try again.' };
      }
    }

    // Fetch all current alerts
    const fetchResult = await getCoachAlerts(coachId, teamId);

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/alerts');
    // Defense-in-depth: /alerts is a permanent-redirect shim onto the coach
    // Intelligence home's Signals drill (2026-07-19, plan Task 9) — revalidate
    // the canonical destination too so a coach landed there already doesn't
    // see stale data (pattern: v3/goals.ts createTeamGoal).
    revalidatePath('/golf/dashboard/intelligence');

    // P2-14 acceptance test 1: the reported count must equal the rows the
    // canonical V3 feed actually surfaces, NOT `newAlerts.length`. The legacy
    // alert rows (metadata-shaped, no `evidence`, not engine_version='v3') are
    // structurally invisible to the V3 read, so reporting the insert count
    // over-claimed. Report the visible delta from the canonical read instead;
    // when the count read fails, omit the number rather than fabricate one.
    const visibleAfter = await countVisibleCoachInsights(supabase);
    const visibleDelta =
      visibleBefore != null && visibleAfter != null
        ? Math.max(0, visibleAfter - visibleBefore)
        : undefined;

    return {
      success: true,
      alerts: fetchResult.alerts || [],
      generated: visibleDelta,
    };
  } catch (error) {
    await logServerError(`generateAlerts failed: ${describeError(error)}`, {
      action: 'generateAlerts',
      featureArea: 'alerts',
      extra: { coachId, teamId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedGenerateAlerts = withAdminObserved(
  'generateAlerts',
  { sport: 'golf', feature: 'alerts_system' },
  generateAlertsImpl,
);
export async function generateAlerts(
  coachId: string,
  teamId: string
): Promise<{
  success: boolean;
  alerts?: CoachAlert[];
  generated?: number;
  error?: string;
}> {
  return observedGenerateAlerts(coachId, teamId);
}

// ============================================================================
// HELPERS
// ============================================================================

function mapPriorityToLevel(priority: string | null): 'critical' | 'warning' | 'info' | 'suggestion' {
  switch (priority) {
    case 'critical':
    case 'high':
      return 'critical';
    case 'medium':
    case 'warning':
      return 'warning';
    case 'low':
      return 'suggestion';
    default:
      return 'info';
  }
}
