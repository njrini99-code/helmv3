import type { InngestFunction } from 'inngest';
import { inngest } from './client';
import { logServerException, logServerEvent } from '@/lib/server-error-logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';
import { startCronCheckIn, finishCronCheckIn } from '@/lib/observability/cron-monitors';

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
 *
 * Also wraps a Sentry Cron Monitor check-in around every attempt (job_name =
 * fnId, the same `id` each function is registered under), via the identical
 * fail-open helpers job-log.ts uses for Vercel crons
 * (src/lib/observability/cron-monitors.ts). None of these three ids are
 * Vercel-scheduled paths, so CRON_REGISTRY has no entry for them and every
 * check-in here carries no monitorConfig (cron-monitors.ts's documented
 * fallback) — Sentry still records occurrences and duration, it just never
 * invents a cadence Inngest's own event/cron triggers don't come from
 * vercel.json in the first place.
 */
// Exported ONLY for direct unit testing of the check-in/Bridge-logging
// wrapper without needing a live Inngest test harness to invoke a full
// InngestFunction — see __tests__/functions-bridge-logging.test.ts.
export async function withBridgeLogging<T>(fnId: string, run: () => Promise<T>): Promise<T> {
  const checkInId = startCronCheckIn(fnId);
  const startedAt = Date.now();
  try {
    const result = await run();
    finishCronCheckIn(fnId, checkInId, 'ok', Date.now() - startedAt);
    return result;
  } catch (err) {
    finishCronCheckIn(fnId, checkInId, 'error', Date.now() - startedAt);
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

/**
 * Health probe — the ONLY way to prove Inngest is actually working end to end.
 *
 * Two credentials fail independently and a passing check on one says nothing
 * about the other:
 *
 *   INNGEST_EVENT_KEY    outbound. We send an event TO Inngest.
 *                        Broken -> "Inngest API Error: 404 Event key not found"
 *   INNGEST_SIGNING_KEY  inbound.  Inngest calls /api/inngest to RUN the
 *                        function. Broken -> signature validation fails and the
 *                        function never executes, while the send still looked
 *                        fine.
 *
 * Production carried exactly that split: the event key was rejected from
 * 2026-07-27, and the signing key has been rejecting Inngest's own calls since
 * 2026-08-07 — so "is Inngest configured?" was true, every send after the key
 * rotation was lost, and the scheduled/derived work behind it silently did not
 * run. `isInngestConfigured()` only reads that the variables EXIST.
 *
 * This function writes a row keyed by a caller-supplied probeId. The row can
 * only exist if Inngest accepted the event AND successfully called back in to
 * execute this handler. Its presence is the proof; nothing else in the system
 * writes that action.
 *
 * Harmless by construction: one admin_events row, no user data read or
 * written, idempotent, safe to run against production at any time.
 * Drive it with `node scripts/inngest-health-check.mjs`.
 */
export const healthPing: InngestFunction.Any = inngest.createFunction(
  {
    id: 'inngest-health-probe',
    triggers: [{ event: 'helm/health.ping' }],
    onFailure: async ({ error }: { error: Error }) => {
      await logServerException(error, { action: 'inngest.health-probe', source: 'background_job' }, 'error');
    },
  },
  async ({ event, step }) =>
    withBridgeLogging('inngest-health-probe', async () => {
      const probeId = String((event.data as { probeId?: unknown })?.probeId ?? 'unknown');

      await step.run('record-arrival', async () => {
        await logServerEvent(
          `Inngest health probe executed (${probeId})`,
          {
            action: 'inngest.health-probe',
            source: 'background_job',
            metadata: { probeId, sentAt: (event.data as { sentAt?: unknown })?.sentAt ?? null },
            skipSentry: true,
          },
          'info',
        );
        return true;
      });

      return { ok: true, probeId };
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
export const functions = [weeklyHealthPing, onCoachHelmRoundSubmitted, healthPing];
