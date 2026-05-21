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
 * Run the CoachHelm engine for a single round and record terminal state on
 * `golf_rounds`. Never throws — fire-and-forget safe from `after()` callbacks.
 */
export async function postRoundTrigger(
  admin: SupabaseClient,
  args: PostRoundTriggerArgs,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const result = await triggerPlayerInsightsAfterRound(args.playerId);

    if (!result.success) {
      const reason = result.error ?? 'engine reported failure';
      await admin
        .from('golf_rounds')
        .update({
          coachhelm_failed_at: now,
          coachhelm_failure_reason: reason.slice(0, 500),
        })
        .eq('id', args.roundId);
      await logServerError(`postRoundTrigger engine failed: ${reason}`, {
        action: 'postRoundTrigger.engineFailure',
        featureArea: 'coachhelm',
        playerId: args.playerId,
        extra: { roundId: args.roundId, triggerReason: args.triggerReason ?? 'round_submitted' },
      });
      return;
    }

    await admin
      .from('golf_rounds')
      .update({
        coachhelm_analyzed_at: now,
        coachhelm_failed_at: null,
        coachhelm_failure_reason: null,
      })
      .eq('id', args.roundId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    try {
      await admin
        .from('golf_rounds')
        .update({
          coachhelm_failed_at: now,
          coachhelm_failure_reason: reason.slice(0, 500),
        })
        .eq('id', args.roundId);
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
  }
}
