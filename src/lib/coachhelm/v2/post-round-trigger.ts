/**
 * postRoundTrigger — idempotent post-round CoachHelm trigger that writes
 * terminal state to `golf_rounds.coachhelm_analyzed_at` /
 * `coachhelm_failed_at` so the safety-net cron can deterministically
 * identify rounds that still need processing.
 *
 * Designed for `after(() => postRoundTrigger(admin, args))` from the round
 * submit server action — see audit Finding 2 / A-NEW-6.
 *
 * Closes:
 *   - the HTTP self-call hop (no internal `fetch` to `/api/coachhelm/...`)
 *   - the safety-net heuristic (state columns replace the "any active
 *     insight after round.created_at" probe)
 *   - the 200-OK-on-failure observability gap (failures persist to the
 *     row so operators can see them in DB)
 *
 * NOT a replacement for triggerPlayerInsightsAfterRound — wraps it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { triggerPlayerInsightsAfterRound } from '@/app/golf/actions/insights';
import { logServerError } from '@/lib/server-error-logger';

export interface PostRoundTriggerArgs {
  playerId: string;
  roundId: string;
  triggerReason?: 'round_submitted' | 'safety_net' | 'manual_refresh' | 'cron';
}

/**
 * Map raw engine error messages to a stable short code before persisting to
 * golf_rounds.coachhelm_failure_reason. The player can SELECT their own
 * golf_rounds row, so the persisted value must not leak Postgres error
 * strings, internal table names, or stack-derived text. Verbose context
 * always goes to logServerError below.
 */
type FailureCode =
  | 'engine_timeout'
  | 'engine_session_expired'
  | 'engine_membership_missing'
  | 'engine_disabled'
  | 'engine_no_recent_rounds'
  | 'engine_generator_failure'
  | 'engine_error';

function sanitizeFailureReason(reason: string): FailureCode {
  const lower = reason.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out')) return 'engine_timeout';
  if (lower.includes('session') && lower.includes('expired')) return 'engine_session_expired';
  if (lower.includes('membership')) return 'engine_membership_missing';
  if (lower.includes('disabled')) return 'engine_disabled';
  if (lower.includes('no completed rounds')) return 'engine_no_recent_rounds';
  if (lower.includes('generator failure') || lower.includes('tier-1')) return 'engine_generator_failure';
  return 'engine_error';
}

/**
 * Helper: write terminal state and report any RLS / row-count failures.
 * Defeats the original PR #19 hardening if we silently lose the write.
 */
async function writeTerminalState(
  admin: SupabaseClient,
  roundId: string,
  patch: Record<string, string | null>,
  contextAction: string,
): Promise<void> {
  const { error, count } = await admin
    .from('golf_rounds')
    .update(patch, { count: 'exact' })
    .eq('id', roundId);

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
  if (count === 0) {
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

/**
 * Run the CoachHelm engine for a single round and record terminal state on
 * `golf_rounds`. Never throws — fire-and-forget safe from `after()` callbacks.
 */
export async function postRoundTrigger(
  admin: SupabaseClient,
  args: PostRoundTriggerArgs,
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();
  try {
    const result = await triggerPlayerInsightsAfterRound(args.playerId);

    if (!result.success) {
      const reason = result.error ?? 'engine reported failure';
      await writeTerminalState(
        admin,
        args.roundId,
        {
          coachhelm_failed_at: now,
          coachhelm_failure_reason: sanitizeFailureReason(reason),
        },
        'postRoundTrigger.engineFailure',
      );
      await logServerError(`postRoundTrigger engine failed: ${reason}`, {
        action: 'postRoundTrigger.engineFailure',
        featureArea: 'coachhelm',
        playerId: args.playerId,
        extra: { roundId: args.roundId, triggerReason: args.triggerReason ?? 'round_submitted' },
      });
      return { success: false, error: reason };
    }

    await writeTerminalState(
      admin,
      args.roundId,
      {
        coachhelm_analyzed_at: now,
        coachhelm_failed_at: null,
        coachhelm_failure_reason: null,
      },
      'postRoundTrigger.engineSuccess',
    );
    return { success: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    try {
      await writeTerminalState(
        admin,
        args.roundId,
        {
          coachhelm_failed_at: now,
          coachhelm_failure_reason: sanitizeFailureReason(reason),
        },
        'postRoundTrigger.throw',
      );
    } catch {
      // If even the state-column write fails, we've lost the signal; the
      // logServerError below still captures the original failure.
    }
    await logServerError(`postRoundTrigger threw: ${reason}`, {
      action: 'postRoundTrigger.throw',
      featureArea: 'coachhelm',
      playerId: args.playerId,
      extra: {
        roundId: args.roundId,
        triggerReason: args.triggerReason ?? 'round_submitted',
        stack: err instanceof Error ? err.stack : undefined,
      },
    });
    return { success: false, error: reason };
  }
}
