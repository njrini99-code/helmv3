/**
 * postRoundTrigger — idempotent post-round CoachHelm trigger that writes
 * terminal state to `golf_rounds.coachhelm_analyzed_at` /
 * `coachhelm_failed_at` / `coachhelm_failure_reason` so the safety-net cron
 * can deterministically identify rounds that still need processing.
 *
 * Designed for `after(() => postRoundTrigger(admin, args))` from the round
 * submit server action — see audit Finding 2 / A-NEW-6 — and reused
 * verbatim by the Inngest function, the pgmq consumer and the safety-net
 * cron, so every path stamps the round the same way.
 *
 * Closes:
 *   - the HTTP self-call hop (no internal `fetch` to `/api/coachhelm/...`)
 *   - the safety-net heuristic (state columns replace the "any active
 *     insight after round.created_at" probe)
 *   - the 200-OK-on-failure observability gap (failures persist to the
 *     row so operators can see them in DB)
 *
 * 2026-09-12 (repair plan R3): the engine's result is a typed
 * `AnalysisOutcome` (src/lib/coachhelm/v3/engine/analysis-outcome.ts).
 * Expected states — a player under the coach's round floor, no roster, a
 * coach who switched CoachHelm off — PARK the round (both timestamps null,
 * the code in `coachhelm_failure_reason`) instead of stamping it failed;
 * transient faults stamp failed and are retried by the safety net inside a
 * deadline; everything else stamps failed and stays inspectable with the
 * original exception in the log. Nothing here reads the message text.
 *
 * Worker context: this function needs only the service-role client it is
 * handed. The engine behind the bridge resolves the player's team, coach and
 * philosophy itself with its own admin client — no request session is
 * involved, so it runs identically from `after()`, a queue consumer, or a
 * cron.
 *
 * NOT a replacement for triggerPlayerInsightsAfterRound — wraps it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
// Side-effect-only: guarantees insights.ts's module-scope registration
// (__registerTriggerPlayerInsightsAfterRound) has run before this module's
// own top-level finishes — at synchronous module-init time, so there is no
// async gap for a concurrent request on the same warm instance to race
// against (the cold-start TDZ crash the bridge header documents).
import '@/app/golf/actions/insights';
import { triggerPlayerInsightsAfterRound } from '@/lib/coachhelm/v2/trigger-insights-bridge';
import {
  classifyThrown,
  logSeverityFor,
  outcomeFromTriggerResult,
  terminalStateFor,
  type AnalysisOutcome,
  type AnalysisOutcomeCode,
  type RoundTerminalState,
} from '@/lib/coachhelm/v3/engine/analysis-outcome';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';

export interface PostRoundTriggerArgs {
  playerId: string;
  roundId: string;
  triggerReason?: 'round_submitted' | 'safety_net' | 'manual_refresh' | 'cron';
  /** Which attempt this is for the round (first run = 1). The safety net
   *  passes the next number when it retries a transient failure so the
   *  attempt count on the reason column keeps climbing to exhaustion. */
  attempt?: number;
}

export interface PostRoundTriggerResult {
  /** True for `succeeded` and `partial` — the round is analyzed. */
  success: boolean;
  error?: string;
  partial?: boolean;
  code?: AnalysisOutcomeCode;
  /** The typed outcome every consumer should branch on. */
  outcome: AnalysisOutcome;
}

/**
 * Helper: write terminal state and report any RLS / row-count failures.
 * Defeats the original PR #19 hardening if we silently lose the write.
 */
async function writeTerminalState(
  admin: SupabaseClient,
  roundId: string,
  patch: RoundTerminalState,
  contextAction: string,
): Promise<void> {
  // Completed scorecards are immutable.  Terminal CoachHelm state is the
  // narrow exception, written only by a server-only SECURITY DEFINER RPC that
  // can update these three operational columns and nothing else.
  const { data, error } = await admin.rpc('record_round_coachhelm_terminal_state', {
    p_round_id: roundId,
    p_analyzed_at: patch.coachhelm_analyzed_at,
    p_failed_at: patch.coachhelm_failed_at,
    p_failure_reason: patch.coachhelm_failure_reason,
  });

  if (error) {
    await logServerError(
      `[postRoundTrigger] terminal-state write failed: ${error.message}`,
      {
        action: contextAction,
        featureArea: 'coachhelm',
        extra: { roundId, errorCode: error.code },
      },
    );
    return;
  }
  if (!data) {
    await logServerError(
      `[postRoundTrigger] terminal-state write affected 0 rows (RLS or missing round)`,
      {
        action: contextAction,
        featureArea: 'coachhelm',
        extra: { roundId },
      },
    );
  }
}

const ACTION_BY_KIND: Record<AnalysisOutcome['kind'], string> = {
  succeeded: 'postRoundTrigger.engineSuccess',
  partial: 'postRoundTrigger.enginePartial',
  waiting_for_data: 'postRoundTrigger.waitingForData',
  not_applicable: 'postRoundTrigger.notApplicable',
  disabled: 'postRoundTrigger.disabled',
  retryable_failure: 'postRoundTrigger.retryableFailure',
  permanent_failure: 'postRoundTrigger.permanentFailure',
};

/**
 * One log line per non-success outcome, at the severity the kind carries.
 * The message is code-stable (the incident fingerprint hashes it), the
 * variable parts — reason, details, the preserved exception — ride in
 * `extra`, so a permanent failure keeps its stack and a transient one its
 * Postgres code.
 */
async function logOutcome(outcome: AnalysisOutcome, args: PostRoundTriggerArgs): Promise<void> {
  if (outcome.kind === 'succeeded') return;
  const { severity, skipSentry } = logSeverityFor(outcome.kind);
  const message = `postRoundTrigger outcome ${outcome.kind}: ${outcome.code}`;
  const context = {
    action: ACTION_BY_KIND[outcome.kind],
    featureArea: 'coachhelm',
    playerId: args.playerId,
    errorCode: outcome.code,
    ...(skipSentry ? { skipSentry: true } : {}),
    extra: {
      roundId: args.roundId,
      triggerReason: args.triggerReason ?? 'round_submitted',
      attempt: args.attempt ?? 1,
      outcomeKind: outcome.kind,
      reason: outcome.message,
      ...(outcome.details ? { details: outcome.details } : {}),
      ...(outcome.cause
        ? {
            causeName: outcome.cause.name,
            causeMessage: outcome.cause.message,
            ...(outcome.cause.code ? { causeCode: outcome.cause.code } : {}),
            ...(outcome.cause.stack ? { stack: outcome.cause.stack } : {}),
          }
        : {}),
    },
  };
  if (severity === 'info') {
    await logServerEvent(message, context, 'info');
  } else {
    await logServerError(message, context, severity);
  }
}

function toResult(outcome: AnalysisOutcome): PostRoundTriggerResult {
  const success = outcome.kind === 'succeeded' || outcome.kind === 'partial';
  return {
    success,
    outcome,
    code: outcome.code,
    ...(outcome.kind === 'partial' ? { partial: true } : {}),
    ...(success ? {} : { error: outcome.message }),
  };
}

/**
 * Run the CoachHelm engine for a single round and record terminal state on
 * `golf_rounds`. Never throws — fire-and-forget safe from `after()` callbacks.
 */
export async function postRoundTrigger(
  admin: SupabaseClient,
  args: PostRoundTriggerArgs,
): Promise<PostRoundTriggerResult> {
  const now = new Date().toISOString();
  let outcome: AnalysisOutcome;
  try {
    outcome = outcomeFromTriggerResult(await triggerPlayerInsightsAfterRound(args.playerId));
  } catch (err) {
    // The engine envelope never throws by contract; reaching here means the
    // bridge itself did (unregistered impl, an unexpected rejection). Keep
    // the exception — it is the diagnosis.
    outcome = classifyThrown(err);
  }

  try {
    await writeTerminalState(
      admin,
      args.roundId,
      terminalStateFor(outcome, now, { attempt: args.attempt }),
      ACTION_BY_KIND[outcome.kind],
    );
  } catch {
    // If even the state-column write fails, we've lost the signal; the
    // logOutcome below still captures the original outcome.
  }
  await logOutcome(outcome, args);
  return toResult(outcome);
}
