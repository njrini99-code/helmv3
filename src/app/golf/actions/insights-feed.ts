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
import { notifyInsightResolved } from '@/lib/notifications/insight-notifier';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { verifyInsightAccess, insightAccessDenialMessage } from '@/lib/auth/verify-player-access';
import { coachHelmIntelligence, isCoachHelmEnabledForCoach } from '@/lib/coachhelm/v2';
import type { PlayerAnalysis } from '@/lib/coachhelm/v2/types';
import type { InsightType } from '@/lib/coachhelm/insight-types';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { effectiveConfidenceThreshold } from '@/lib/coachhelm/constants';
import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import { toInsightInput } from '@/lib/coachhelm/v2/insights/to-insight-input';
import { logServerError } from '@/lib/server-error-logger';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import {
  rankEvidenceInsights,
  type RankableEvidenceInsight,
} from '@/app/golf/actions/insight-delivery-ranking';
import { recordInsightAction } from '@/lib/coachhelm/v3/effectiveness/event-ledger';
// 2026-08-01: gateCoachHelmEngineCall used to live here (private). Lifted into
// @/lib/auth/action-rate-limit so alerts.ts, round-recap.ts, schedule-image.ts
// and v3/llm.ts share ONE definition. Key is unchanged (`coachhelm:engine:<id>`),
// so live counters are not orphaned.
import { gateCoachHelmEngineCall } from '@/lib/auth/action-rate-limit';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';
import { convertV2ToInsightRecord, getCoachPhilosophy, shouldIncludeInsight, weightInsightsByPhilosophy } from './insights-shared';
import type { InsightRecord, WeightedInsight } from './insights-shared';
import { recordInteraction } from './insights-player-analysis';

export interface TeamPlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
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
    const confidenceThreshold = effectiveConfidenceThreshold(philosophy);

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
            await logServerError(`generateTeamInsights player analysis failed: ${describeError(err)}`, {
              action: 'generateTeamInsights.analyzePlayer',
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
      await logServerError(`generateTeamInsights team pattern insights failed: ${describeError(err)}`, {
        action: 'generateTeamInsights.teamPatterns',
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
            `[insights.generateTeamInsights] skipped ${skipped} legacy records with insufficient sample_n`,
          );
        }
        await Promise.all(inputs.map(({ input }) => upsertInsight(supabase, input)));
      } catch (insertError) {
        await logServerError(`generateTeamInsights upsert failed: ${describeError(insertError)}`, {
          action: 'generateTeamInsights.insert',
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
    await logServerError(`generateTeamInsights failed: ${describeError(error)}`, {
      action: 'generateTeamInsights',
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

/** A `golf_coach_insights` row (+ player join) as this feed returns it —
 *  the rankable fields are what `rankEvidenceInsights` reads. */
type ActiveInsightRow = RankableEvidenceInsight & {
  player: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
};
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
    //
    // Ranking (repair plan N5): this feed used to `.order('priority')` — a
    // TEXT column, so ascending was high < low < medium < urgent — and cut to
    // `limit` in that non-order. Read the coach's FULL visible active set
    // (≤ 120 rows per coach today; paginated past the PostgREST cap like every
    // other feed), rank it with the SAME `scoreInsight` composite the Hub /
    // player / coach feeds use, then take the top `limit`.
    const { data, error } = await fetchAllRowsResult<ActiveInsightRow>(
      (from, to) =>
        applyInsightVisibility(
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
          .order('id', { ascending: true })
          .range(from, to),
      undefined,
      { table: 'golf_coach_insights', action: 'getActiveInsights', feature: 'coachhelm_ai_engine', sport: 'golf' },
    );

    if (error) {
      await logServerError(`getActiveInsights query failed: ${error.message}`, {
        action: 'getActiveInsights',
        featureArea: 'insights',
        extra: { errorCode: error.code },
      });
      return { success: false, error: 'Failed to generate insights. Please try again.', insights: [] };
    }

    const ranked = await rankEvidenceInsights(data ?? [], {}, [], supabase);
    return { success: true, insights: ranked.slice(0, limit) };
  } catch (error) {
    await logServerError(`getActiveInsights failed: ${describeError(error)}`, {
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
      return { success: false, error: insightAccessDenialMessage(access.reason) };
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
      await recordInsightAction({
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
    await logServerError(`acknowledgeInsight failed: ${describeError(error)}`, {
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
      return { success: false, error: insightAccessDenialMessage(access.reason) };
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
      await recordInsightAction({
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
    await logServerError(`dismissInsight failed: ${describeError(error)}`, {
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
 *
 * CH13-14: undoing a DISMISSAL (`undoing: 'dismiss'`) keeps an earlier
 * acknowledgement — dismiss never clears `acknowledged_at`, so the row goes
 * back to 'acknowledged' with its stamp, not to 'active'.
 */
async function reactivateInsightImpl(
  insightId: string,
  priorLifecycleState?: 'detected' | 'matured' | 'addressed' | 'resolved',
  undoing: 'acknowledge' | 'dismiss' = 'acknowledge',
) {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const access = await verifyInsightAccess(insightId, user.id, supabase);
    if (!access.allowed) {
      return { success: false, error: insightAccessDenialMessage(access.reason) };
    }

    // Restore to a VISIBLE lifecycle state so the row returns to the feed; never
    // leave it 'archived'/'tentative' (the visibility filter would hide it).
    const lifecycle = priorLifecycleState ?? 'detected';

    let restore: { status: 'active' | 'acknowledged'; acknowledged_at?: null } = { status: 'active', acknowledged_at: null };
    if (undoing === 'dismiss') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prior, error: priorError } = await (supabase as any)
        .from('golf_coach_insights')
        .select('acknowledged_at')
        .eq('id', insightId)
        .eq('team_id', access.teamId)
        .maybeSingle();
      if (priorError) {
        await logServerError(`reactivateInsight failed: ${priorError.message}`, {
          action: 'reactivateInsight',
          featureArea: 'insights',
          extra: { insightId, errorCode: priorError.code },
        });
        return { success: false, error: 'Operation failed. Please try again.' };
      }
      restore = prior?.acknowledged_at ? { status: 'acknowledged' } : { status: 'active' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        ...restore,
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
    await logServerError(`reactivateInsight failed: ${describeError(error)}`, {
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
  undoing: 'acknowledge' | 'dismiss' = 'acknowledge',
) {
  return observedReactivateInsight(insightId, priorLifecycleState, undoing);
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
      return { success: false, error: insightAccessDenialMessage(access.reason) };
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
      .select('id, player_id, category');

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
      await recordInsightAction({
        insight_id: insightId,
        player_id: resolvePlayerId,
        actor_id: user.id,
        actor_role: 'coach',
        action_type: 'resolved',
      });
      // Audit row 53: the player hears their insight was closed (never throws).
      await notifyInsightResolved({
        player_id: resolvePlayerId,
        insight_id: insightId,
        category: (data[0] as { category?: string | null }).category ?? 'general',
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
    await logServerError(`resolveInsight failed: ${describeError(error)}`, {
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
    const { data: insight, error: insightError } = await (supabase as any)
      .from('golf_coach_insights')
      .select('id, insight_type, priority, metadata')
      .eq('id', insightId)
      .eq('coach_id', coach.id)
      .single();

    // Ownership guard — denying on a failed read is right and is kept. What
    // was wrong is the reason: a discarded error became "Insight not found",
    // telling a coach the insight they are looking at does not exist.
    // .single() reports no-row as PGRST116 rather than null data, so the two
    // are separated explicitly and the genuine not-found still fires.
    if (insightError && (insightError as { code?: string }).code !== 'PGRST116') {
      await logServerError(
        `[insights] insight read failed — denying, but this is an outage not a missing insight: ${describeError(insightError)}`,
        { action: 'insights.rateInsight', featureArea: 'coachhelm' },
      );
      return { success: false, error: "Couldn't load this insight. Please try again." };
    }

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
        // snake_case: BehaviorLearner.aggregate() buckets byInsightType off
        // metadata.insight_type (not the camelCase insightType below, kept
        // for existing readers of this metadata blob).
        insight_type: insight.insight_type,
        insightType: insight.insight_type,
        priority: insight.priority,
        rating,
      });
    } catch (err) {
      // Non-critical - don't fail the operation
      await logServerError(`rateInsight interaction recording failed: ${describeError(err)}`, {
        action: 'rateInsight.recordInteraction',
        featureArea: 'insights',
        extra: { insightId },
      }, 'warning');
    }

    return { success: true };
  } catch (error) {
    await logServerError(`rateInsight failed: ${describeError(error)}`, {
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
