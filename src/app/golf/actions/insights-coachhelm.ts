'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import {
  coachHelmIntelligence,
  isCoachHelmEnabledForCoach,
  isCoachHelmEnabledForPlayer,
} from '@/lib/coachhelm/v2';
import type { ComposedInsight } from '@/lib/coachhelm/v2/types';
import type { InsightType, InsightPriority } from '@/lib/coachhelm/insight-types';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { effectiveConfidenceThreshold } from '@/lib/coachhelm/constants';
import type { PhilosophyGate } from '@/lib/coachhelm/v2/insights/gate-context';
import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import { loadAlertPostureForPlayer } from '@/lib/coachhelm/v3/intent/loader';
import { toInsightInput } from '@/lib/coachhelm/v2/insights/to-insight-input';
import { classifyDashboardFailure } from '@/lib/coachhelm/v2/dashboard-error-classifier';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { loadCoachWeightsForPlayer, rankInsights } from '@/lib/coachhelm/v3/ranking/score';
import { loadActiveGoals } from '@/lib/coachhelm/v3/goals/loader';
// 2026-08-01: gateCoachHelmEngineCall used to live here (private). Lifted into
// @/lib/auth/action-rate-limit so alerts.ts, round-recap.ts, schedule-image.ts
// and v3/llm.ts share ONE definition. Key is unchanged (`coachhelm:engine:<id>`),
// so live counters are not orphaned.
import { gateCoachHelmEngineCall } from '@/lib/auth/action-rate-limit';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import {
  __registerTriggerPlayerInsightsAfterRound,
  type TriggerPlayerInsightsResult,
} from '@/lib/coachhelm/v2/trigger-insights-bridge';
import { classifyThrown } from '@/lib/coachhelm/v3/engine/analysis-outcome';
import { describeError } from '@/lib/utils/describe-error';
import { buildFocusAreasFromAnalysis, convertV2ToInsightRecord, getCoachPhilosophy, shouldIncludeInsight, verifyPlayerAccessForInsights, weightInsightsByPhilosophy } from './insights-shared';
import type { InsightRecord, PlayerCoachHelmDashboardData } from './insights-shared';

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
    // DS-03: this took a caller-supplied entityId with no session and no
    // ownership check, and gate.ts defaults to the admin client — so RLS was
    // not a backstop. It leaked the coach-authored disabledReason for any
    // tenant and worked as an id-existence oracle. Denials return the same
    // { success: false, enabled: true } shape the catch below returns, so the
    // client (which renders off `enabled`) is unchanged and learns nothing.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, enabled: true };
    }

    if (entityType === 'player') {
      const access = await verifyPlayerAccessForInsights(entityId);
      if (!access.authorized) {
        return { success: false, enabled: true };
      }
    } else {
      // Multi-org: a user can hold more than one golf_coaches row.
      const { data: coachRows } = await supabase
        .from('golf_coaches')
        .select('id')
        .eq('user_id', user.id);
      const isSelfCoach = (coachRows ?? []).some((c) => c.id === entityId);
      if (!isSelfCoach) {
        return { success: false, enabled: true };
      }
    }

    const status = entityType === 'coach'
      ? await isCoachHelmEnabledForCoach(entityId)
      : await isCoachHelmEnabledForPlayer(entityId);

    return {
      success: true,
      enabled: status.effectivelyEnabled,
      disabledReason: status.disabledReason,
    };
  } catch (error) {
    await logServerError(`getCoachHelmStatus failed: ${describeError(error)}`, {
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
async function getPlayerCoachHelmDashboardImpl(
  playerId: string
): Promise<{ success: boolean; data?: PlayerCoachHelmDashboardData; error?: string; errorCode?: 'COACHHELM_DISABLED' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'TRANSIENT_FAILURE' | 'UNKNOWN' }> {
  const supabase = await createClient();

  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccessForInsights(playerId);
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

    // Run analysis to get all insights. persistPatterns: false — this is a
    // page READ, not a write trigger. Without it, analyzePlayer's shot-pattern
    // mining unconditionally upserts into golf_patterns_v2 as a side effect
    // of loading the dashboard, which raced the coachhelm-* crons writing the
    // same table and surfaced as a live Postgres deadlock (40P01) that failed
    // this whole page load. The crons and the post-round trigger
    // (triggerPlayerInsightsAfterRoundImpl below) are the legitimate writers
    // and are unaffected — they don't pass this option, so it defaults true.
    // The same flag keeps the causal engine off golf_causal_relationships
    // (ca4409c2 / ed64f3b6, 2026-09-28: its failed UPDATE failed this page).
    //
    // runInsightGenerators: false — same rule, bigger write. Without it every
    // page view also ran all 20 Tier-1 generators (raw golf_shots reads +
    // golf_coach_insights upserts) and the composite synthesis. On 2026-09-24
    // two sessions reloading this page saturated Postgres for ~35 minutes
    // (Bridge 57d84dd1, 80142968, 50b1304c, 4263ab45, ac69c80b and ~60
    // siblings). The insights those generators produce are still shown: the
    // round-submit trigger and the safety-net/roster-sweep crons write them,
    // and loadEvidenceBackedInsights below reads them.
    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: true,
      includeCausal: true,
      includePredictions: true,
      includeShotPatterns: true,
      persistPatterns: false,
      runInsightGenerators: false,
      depth: 'standard',
    });

    // Get recent rounds for review
    const { data: recentRoundsData } = await supabase
      .from('golf_rounds')
      .select('id, course_name, round_date, total_score, score_to_par')
      .eq('player_id', playerId)
      .eq('is_test', false)
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
    await logServerError(`getPlayerCoachHelmDashboard failed: ${describeError(error)}`, {
      action: 'getPlayerCoachHelmDashboard',
      featureArea: 'insights',
    });
    // Distinguish a retryable DB hiccup (deadlock/timeout/connection) from a
    // genuine bug so the page can auto-retry once instead of always dead-ending
    // on the hard "Unable to Load AI Dashboard" state — see
    // classifyDashboardFailure's doc for the full rationale.
    const errorCode = classifyDashboardFailure(error);
    return {
      success: false,
      error:
        errorCode === 'TRANSIENT_FAILURE'
          ? 'Your insights are still catching up — please try again in a moment.'
          : 'An unexpected error occurred',
      errorCode,
    };
  }
}
const observedGetPlayerCoachHelmDashboard = withAdminObserved(
  'getPlayerCoachHelmDashboard',
  { sport: 'golf', feature: 'player_coachhelm_dashboard' },
  getPlayerCoachHelmDashboardImpl,
);
export async function getPlayerCoachHelmDashboard(
  playerId: string
): Promise<{ success: boolean; data?: PlayerCoachHelmDashboardData; error?: string; errorCode?: 'COACHHELM_DISABLED' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'TRANSIENT_FAILURE' | 'UNKNOWN' }> {
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

    if (error || !data) {
      // This function's ComposedInsight[] return bypasses withAdminObserved's
      // soft-failure detection entirely (extractActionSoftFailure returns
      // null for an array), so a real read failure here previously
      // vanished — indistinguishable from "the player has no persisted
      // insights yet". Observability only; the fallback [] is unchanged.
      void logServerError(
        `loadEvidenceBackedInsights read failed: ${error?.message ?? 'no data returned'}`,
        {
          action: 'loadEvidenceBackedInsights',
          featureArea: 'insights',
          playerId,
          errorCode: error?.code,
          errorDetails: error?.details,
        },
        'warning'
      );
      // Deliberate, not a swallow — the comment above already documents
      // this: observability was added deliberately and the empty fallback
      // was explicitly kept unchanged.
      return [];
    }

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
  } catch (err) {
    void logServerError(
      `loadEvidenceBackedInsights threw: ${describeError(err)}`,
      {
        action: 'loadEvidenceBackedInsights',
        featureArea: 'insights',
        playerId,
        extra: { stack: err instanceof Error ? err.stack : undefined },
      },
      'error'
    );
    return [];
  }
}
// `acknowledgeComposedInsight`/`dismissComposedInsight` (V2 in-memory
// composed-insight accept/dismiss pair) removed 2026-09-22 — confirmed zero
// non-test, non-registry-inventory callers by a fresh `git grep`. Their
// historical rows (a handful, 2026-06/07) are the entire explanation for a
// mismatch found during the golf_insight_action ledger investigation:
// acknowledgeComposedInsightImpl inserted a pre-acknowledged
// insight_type='pattern_detected' row and only logged to the OLD v2
// interaction tracker (recordInteraction/BehaviorLearner), never to the v3
// effectiveness ledger (recordInsightAction) — a real gap, but on a path
// nothing calls today.

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
): Promise<TriggerPlayerInsightsResult> {
  // The result envelope is the bridge's `TriggerPlayerInsightsResult`: every
  // `success: false` below carries a typed `code` from
  // src/lib/coachhelm/v3/engine/analysis-outcome.ts (R3) — the observability
  // layer, postRoundTrigger, the safety-net cron and the queue consumer all
  // classify off that code, never off the user-facing `error` string. A
  // caught exception travels along as `cause`, intact.
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
      // Not a defect. CoachHelm is a coach-owned layer: it needs a roster to
      // resolve the team's organisation, its coach, and that coach's
      // philosophy. A player who has never joined a team — or who left / was
      // removed, which hard-deletes the golf_team_members row (see
      // removePlayerFromTeam in src/app/golf/actions/roster.ts and
      // handleLeaveTeam in JoinTeamSection.tsx) — has nothing to resolve
      // against, so there is no work to retry and nothing for an operator to
      // repair in code. Coded so every consumer classifies it identically
      // (see the `code` field's doc comment above); without it this landed in
      // the Errors tab at 'error' from three separate call sites.
      return {
        success: false,
        error: 'No active team membership for player',
        code: 'engine_no_team_membership',
      };
    }

    const teamId = membership.team_id;
    const orgId = (membership.golf_teams as { organization_id: string } | null)?.organization_id;
    // No organisation → no coach → no philosophy to run against. Typed as
    // not-applicable (R3): nothing to retry until the team's org is fixed.
    if (!orgId) return { success: false, error: 'Team organization not found', code: 'engine_no_coach' };

    // Find the coach for this organization.
    //
    // The order is load-bearing, not cosmetic: `player-signal-settings.ts`
    // documents that it resolves the coach the SAME way as this path, so a
    // player's Stats page and their post-round insights agree on whose windows
    // apply. Without a total order neither query guarantees a row, so two
    // multi-coach organizations (measured: 2, holding 5 coaches) could resolve
    // differently here than there. `created_at` is nullable, so `id` is the
    // tie-break that makes it total. Keep the two in step.
    const { data: coach } = await admin
      .from('golf_coaches')
      .select('id')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .limit(1)
      .single();

    if (!coach) return { success: false, error: 'Coach not found for team organization', code: 'engine_no_coach' };

    const { data: coachSettings } = await admin
      .from('golf_coachhelm_settings')
      .select('enabled, disabled_reason')
      .eq('coach_id', coach.id)
      .maybeSingle();
    if (coachSettings?.enabled === false) {
      // An intentional switch-off, not a failure (R3 `disabled`): the round
      // parks until the setting changes.
      return {
        success: false,
        error: coachSettings.disabled_reason || 'CoachHelm disabled for coach',
        code: 'engine_disabled',
        details: { scope: 'coach' },
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
        code: 'engine_disabled',
        details: { scope: 'team' },
      };
    }

    // Get coach philosophy
    const philosophy = await getCoachPhilosophy(coach.id, admin);
    let confidenceThreshold = effectiveConfidenceThreshold(philosophy);

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

    // Coach's "minimum rounds before CoachHelm speaks" floor. Prior to this
    // the engine's only round gate was ABSOLUTE_MIN_ROUNDS=4 buried in the
    // pattern miner — a coach could not raise it, so a player with 4 rounds
    // got the same confident prose as one with 40. Resolved here, where the
    // philosophy is already loaded, so a starved player is skipped BEFORE any
    // generator runs rather than having its output filtered afterwards.
    //
    // 2026-09-12 (repair plan R3): a player under the floor is a
    // `waiting_for_data` outcome — typed, with the numbers — not a failure
    // and not "no completed rounds in the last 90 days" (which is what this
    // path used to report, so 65 completed rounds in production sat stamped
    // coachhelm_failed_at for a player who had simply not played three
    // rounds yet). The round parks; the next completed round wakes it.
    const { count: completedRoundCount } = await admin
      .from('golf_rounds')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('is_test', false)
      .eq('status', 'completed');

    // `count` is null when the client can't report one (and in test doubles
    // that don't implement head/count) — treat an UNKNOWN count as "no
    // opinion" and let analysis proceed, rather than silently muting a coach.
    const belowRoundFloor =
      typeof completedRoundCount === 'number' &&
      completedRoundCount < philosophy.minRoundsForSignal;

    if (belowRoundFloor) {
      await logServerEvent(
        `[insights.triggerPlayerInsightsAfterRound] player is under the coach round floor — skipping generation`,
        {
          action: 'insights.triggerPlayerInsightsAfterRound.belowRoundFloor',
          featureArea: 'coachhelm',
          playerId,
          // A coach setting doing its job, not a fault.
          skipSentry: true,
          // The nightly roster sweep re-evaluates the same under-floor players
          // every run; one row per player per burst, not per sweep.
          durableCollapse: true,
          dbFingerprint: `round-floor:${playerId}`,
          extra: { completedRounds: completedRoundCount, floor: philosophy.minRoundsForSignal },
        },
        'info',
      );
      return {
        success: false,
        error: `${completedRoundCount} completed round${completedRoundCount === 1 ? '' : 's'} so far — CoachHelm speaks after ${philosophy.minRoundsForSignal} (the coach's minimum-rounds setting)`,
        code: 'engine_below_round_floor',
        details: { completedRounds: completedRoundCount, floor: philosophy.minRoundsForSignal },
      };
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

    // Run analysis for this single player. The orchestrator uses the
    // service-role admin client throughout (no request session involved), so
    // a throw here is a real engine fault and is classified as one —
    // transient faults retry, everything else stays inspectable with its
    // original exception attached (R3). It used to map EVERY throw to
    // "session expired".
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
            // Window controls (migration 20260725140000). The philosophy is
            // already loaded here, so hand the miner its window rather than
            // making it re-resolve player → coach on its own.
            patternLookbackDays: philosophy.patternLookbackDays,
            minRoundsForSignal: philosophy.minRoundsForSignal,
          });
    } catch (analysisError) {
      const outcome = classifyThrown(analysisError);
      return {
        success: false,
        error: `Player analysis threw: ${outcome.message}`,
        code: outcome.code,
        ...(outcome.cause ? { cause: outcome.cause } : {}),
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

    // Age out stale V2 insights so post-round analysis can refresh them.
    // Without this, insights from weeks ago block new ones via dedup, causing 0-insight generations.
    //
    // P1 B3 (2026-07-23 accuracy audit): this sweep used to write
    // status='resolved' on every aged-out row WITHOUT checking whether the
    // underlying metric actually improved. 'resolved' is the exact value
    // `resolveInsightImpl` writes for genuine coach/outcome-validated
    // resolution (paired with resolved_at + lifecycle_state='resolved', and
    // read by InsightCard's confetti gate on lifecycle_state='resolved',
    // insight-management.ts's stats.resolved counter, and
    // coachhelm-analytics.ts effectiveness metrics) — reusing it here
    // silently hid live problems, including a coach's biggest insight,
    // under a label that means "this got fixed."
    //
    // Fix: age-sweep into a status that does not collide with any genuine
    // resolution path. `golf_coach_insights_status_check` (verified against
    // the live schema via pg_constraint, 2026-07-23) only permits
    // 'active' | 'acknowledged' | 'dismissed' | 'resolved' — there is no
    // 'superseded'/'stale' enum member, and adding one needs a migration,
    // which is out of scope (this task is additive APP-code only, no DB
    // migrations). Of the two remaining non-'active', non-'resolved' values:
    // 'acknowledged' stays searchable — command-palette.ts's insight search
    // explicitly whitelists status IN ('active','acknowledged') — so it
    // would leave the aged row visible in the very surface this sweep exists
    // to clear it from. 'dismissed' is excluded there and everywhere else
    // that scopes to 'active', and carries no resolution-outcome semantics,
    // so it's the correct choice.
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await admin
      .from('golf_coach_insights')
      .update({ status: 'dismissed' })
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
              // Explicit even though it is the default — this recipient is the
              // team COACH (resolved from golf_coaches above), and the payload
              // picks a coach-vs-player destination off this field.
              audience: 'coach',
            });
          }
        } catch (pushErr) {
          await logServerError(`[Push] coachhelm_insight notification failed: ${describeError(pushErr)}`, { action: 'insights.triggerPlayerInsightsAfterRound' });
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
      `CoachHelm post-round trigger failed: ${describeError(error)}`,
      {
        action: 'triggerPlayerInsightsAfterRound',
        extra: {
          playerId,
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
      'error'
    );
    const outcome = classifyThrown(error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'CoachHelm post-round trigger failed',
      code: outcome.code,
      ...(outcome.cause ? { cause: outcome.cause } : {}),
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
