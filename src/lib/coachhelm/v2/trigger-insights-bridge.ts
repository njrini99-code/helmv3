import 'server-only';

/**
 * ============================================================================
 * Trusted-server bridge for `triggerPlayerInsightsAfterRound`
 * ----------------------------------------------------------------------------
 * SECURITY: the real implementation (service-role admin client, zero user
 * auth gate, caller-supplied player_id, generates + writes CoachHelm
 * insights) lives as a MODULE-PRIVATE function inside
 * `src/app/golf/actions/insights.ts` (a 'use server' file) — it is
 * intentionally NOT exported from there. Every exported async function in a
 * 'use server' file is registered by Next.js as a public, directly-POSTable
 * server action (discoverable by its action id) regardless of whether any
 * client component ever imports it, so exporting this admin-bypass function
 * would let anyone POST an arbitrary player_id and trigger (and read back
 * the count of) CoachHelm insight generation for that player with no
 * session — and fan out to a real LLM/engine run per call.
 *
 * The implementation stays inside insights.ts (not relocated here) because
 * it is deeply entangled with dozens of module-private helpers local to
 * that ~4400-line file (getCoachPhilosophy, shouldIncludeInsight,
 * convertV2ToInsightRecord, weightInsightsByPhilosophy, InsightRecord, the
 * coachHelmIntelligence orchestrator wiring, etc.) shared across many other
 * exported actions there — relocating it would drag that whole cluster out
 * and risk regressing unrelated actions.
 *
 * This file is a plain server module (no 'use server', no 'use client') —
 * its exports are ordinary functions, never actions. It exists purely to
 * hand the ALREADY-AUTHORIZED, non-interactive callers that legitimately
 * need the raw engine trigger (the post-round fire-and-forget trigger in
 * `post-round-trigger.ts`, the roster-sweep safety-net cron) a way to reach
 * that private implementation without insights.ts ever exporting it.
 *
 * Wiring: insights.ts calls `__registerTriggerPlayerInsightsAfterRound(...)`
 * at its own module scope (a side effect, not an export) to hand this
 * bridge a reference to the withAdminObserved-wrapped impl.
 * `triggerPlayerInsightsAfterRound` below lazily triggers that registration
 * (via a dynamic import of insights.ts) the first time it's called in a
 * given process, then delegates to the registered function on every call —
 * same object, same behavior, just never exported from a 'use server'
 * module. The one legitimate CLIENT-reachable path (a coach manually
 * refreshing a player's analysis) is unaffected — it goes through the
 * already-authed sibling action `refreshPlayerAnalysisAsCoach`, which is
 * still exported from insights.ts and calls the private impl directly
 * in-process (same file, no export needed).
 * ========================================================================== */

type TriggerPlayerInsightsFn = (
  playerId: string,
) => Promise<{
  success: boolean;
  insights_created?: number;
  error?: string;
  partial?: boolean;
  /**
   * Stable, non-message-derived classification mirrored from
   * triggerPlayerInsightsAfterRoundImpl (src/app/golf/actions/insights.ts) —
   * BOTH consumers of this result (the withAdminObserved-wrapped path via
   * observeActionSoftFailure, AND postRoundTrigger below in
   * post-round-trigger.ts) must classify severity off this same field so
   * they don't disagree on the same signal.
   */
  code?: 'engine_no_recent_rounds' | 'engine_session_expired';
}>;

let impl: TriggerPlayerInsightsFn | null = null;

/**
 * Called once by insights.ts's module-scope side effect on first load.
 * Do not call this from anywhere else — it exists only so that file can
 * hand this bridge a reference to its own module-private implementation.
 */
export function __registerTriggerPlayerInsightsAfterRound(fn: TriggerPlayerInsightsFn): void {
  impl = fn;
}

/**
 * Lightweight per-player insight generation triggered after a round is
 * submitted, or by the safety-net / roster-sweep crons. Fire-and-forget safe
 * (errors are returned, not thrown). Skips the user auth gate by design —
 * every real caller (post-round trigger, cron) has already scoped the
 * player_id via its own auth. NEVER re-export this from a 'use server' file.
 */
export async function triggerPlayerInsightsAfterRound(
  playerId: string,
): Promise<{
  success: boolean;
  insights_created?: number;
  error?: string;
  partial?: boolean;
  code?: 'engine_no_recent_rounds' | 'engine_session_expired';
}> {
  if (!impl) {
    // Load insights.ts so its registration side effect runs. Cheap after the
    // first call — subsequent imports hit the module cache.
    await import('@/app/golf/actions/insights');
  }
  if (!impl) {
    throw new Error(
      '[trigger-insights-bridge] triggerPlayerInsightsAfterRound not registered — ' +
        'insights.ts failed to load or its registration call was removed',
    );
  }
  return impl(playerId);
}
