import type { InngestFunction } from 'inngest';
import { inngest } from './client';
import { logServerException } from '@/lib/server-error-logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';

/**
 * Inngest function registry.
 *
 * Each export here is a durable workflow. Add new ones following the
 * template below. Triggered either by:
 *   - `inngest.send({ name: 'event/name', data: {...} })` — emit from
 *     a server action or another function
 *   - `cron: '0 6 * * 1'` — scheduled
 *
 * After adding a function, also include it in the `functions: [...]`
 * array exported by `src/app/api/inngest/route.ts` so the Inngest
 * runtime can discover it.
 *
 * Pattern: every step is its own retry boundary. Wrap any I/O
 * (Supabase query, third-party API, file write) in `step.run()` so a
 * transient failure only retries the step, not the whole function.
 *
 * Bridge convention: wrap the handler body in `withBridgeLogging(id, ...)`
 * so every failed attempt lands in error_logs/admin_events (via
 * logServerException, at 'warning' severity + skipSentry — expected retry
 * noise until exhaustion) before rethrowing — the throw is preserved so
 * Inngest's own step/function retry logic still sees it. Additionally
 * set `onFailure` in the function config so the FINAL failure (after
 * retries are exhausted) gets its own 'error' severity, Sentry-visible
 * Bridge entry, distinguishable from the per-attempt ones above. This
 * keeps a default multi-attempt retry policy from turning one persistent
 * root cause into N Sentry issues (one per attempt) plus a final one.
 */

/**
 * Logs an in-flight function failure to the Bridge (error_logs + admin_events
 * only — Sentry is deliberately skipped here, see module doc comment above)
 * and rethrows unchanged so Inngest's retry policy is unaffected. Awaited
 * (not fire-and-forget): logServerException never throws on its own logging
 * failures, so awaiting it here cannot change whether/what this function
 * throws — it just orders the log write before the retry-triggering throw.
 */
async function withBridgeLogging<T>(fnId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    await logServerException(err, { action: fnId, source: 'background_job', skipSentry: true }, 'warning');
    throw err;
  }
}

/**
 * Example: scheduled health ping. Replace with a real workflow when
 * migrating one of the v3 backfills (W12/W20/W27/W33/W35).
 */
export const weeklyHealthPing: InngestFunction.Any = inngest.createFunction(
  {
    id: 'weekly-health-ping',
    triggers: [{ cron: '0 14 * * 1' }], // Mondays 14:00 UTC = 10:00 ET
    onFailure: async ({ error }: { error: Error }) => {
      await logServerException(error, { action: 'weekly-health-ping', source: 'background_job' }, 'error');
    },
  },
  async ({ step, logger }) =>
    withBridgeLogging('weekly-health-ping', async () => {
      const ok = await step.run('ping-self', async () => {
        // Replace with a real health check (Supabase ping, Vercel
        // deployment status, CoachHelm budget read, etc.).
        logger.info('inngest weekly ping');
        return true;
      });

      return { ok };
    }),
);

interface CoachHelmRoundSubmittedEventData {
  roundId: string;
  playerId: string;
}

/**
 * Durable post-round CoachHelm trigger (2026-07-25, Fix 3 of the CoachHelm
 * remediation plan). Runs `postRoundTrigger` off an Inngest event instead of
 * `after()` — see the routing branch in `submitGolfRoundComprehensive`
 * (src/app/golf/actions/golf.ts), which sends this event when
 * `isInngestConfigured()` is true and falls back to calling
 * `postRoundTrigger` directly (today's exact behavior) otherwise.
 *
 * Emit with:
 *   await inngest.send({
 *     name: 'coachhelm/round.submitted',
 *     data: { roundId, playerId },
 *   });
 *
 * Deliberately NO static event `id` on the send() call above and NO
 * function-level `idempotency` config here. A coach can legitimately
 * resubmit the same round (fix a miskeyed hole via
 * `submitGolfRoundComprehensive(roundData, existingRoundId)`) and today
 * that reliably re-triggers a fresh CoachHelm pass through the direct path
 * — relied-upon behavior. A static per-round id + `idempotency:
 * 'event.data.roundId'` would silently dedupe that second submission
 * inside Inngest's ~24h idempotency window: no error, no fallback (send()
 * doesn't throw on a dedupe), and `coachhelm_analyzed_at` is already
 * non-NULL from the first pass so the safety-net cron never picks it up
 * either — reproducing the exact "stale insight, silent no-op, no
 * backstop" defect class this whole mission exists to eliminate, in a
 * subtler place. The real requirement — never run two analyses of the SAME
 * round concurrently — is expressed by `concurrency` below instead:
 * Inngest's own retry model already prevents duplicate *independent* runs
 * from a single event without an idempotency key layered on top.
 */
export const onCoachHelmRoundSubmitted: InngestFunction.Any = inngest.createFunction(
  {
    id: 'coachhelm-round-submitted',
    triggers: [{ event: 'coachhelm/round.submitted' }],
    concurrency: [
      { scope: 'fn', key: 'event.data.roundId', limit: 1 },
      { scope: 'fn', limit: 3 },
    ],
    retries: 3,
    onFailure: async ({ error }: { error: Error }) => {
      await logServerException(error, { action: 'coachhelm-round-submitted', source: 'background_job' }, 'error');
    },
  },
  async ({ event, step }) =>
    withBridgeLogging('coachhelm-round-submitted', async () => {
      const { roundId, playerId } = event.data as CoachHelmRoundSubmittedEventData;
      return step.run('post-round-trigger', async () => {
        const admin = createAdminClient();
        return postRoundTrigger(admin, {
          playerId,
          roundId,
          triggerReason: 'round_submitted',
        });
      });
    }),
);

// 2026-07-25: no baseball CoachHelm function is registered here yet —
// src/app/baseball/actions/coachhelm.ts:13 and
// src/lib/baseball/coachhelm/outcome-sweep.ts:15 both reference a future
// "Inngest scheduled sweep (src/lib/inngest/functions.ts)" as planned, not
// present. Confirmed by reading this file: only weeklyHealthPing existed
// before this change. When that baseball function lands, add it to the
// array below alongside these two rather than replacing either entry.
export const functions = [weeklyHealthPing, onCoachHelmRoundSubmitted];
