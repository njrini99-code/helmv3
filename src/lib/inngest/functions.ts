import type { InngestFunction } from 'inngest';
import { inngest } from './client';
import { logServerException } from '@/lib/server-error-logger';

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

/**
 * Example: event-driven workflow. A round-completion event triggers
 * a CoachHelm review pass with step-level retries on the LLM call.
 *
 * Emit with:
 *   await inngest.send({
 *     name: 'round/completed',
 *     data: { roundId, playerId, teamId },
 *   });
 *
 * Uncomment + implement when integrating with the round-completion
 * flow. The shape here is illustrative.
 */
// export const onRoundCompleted = inngest.createFunction(
//   { id: 'on-round-completed', retries: 3 },
//   { event: 'round/completed' },
//   async ({ event, step }) => {
//     const stats = await step.run('compute-strokes-gained', async () => {
//       // ... call your scoring lib ...
//     });
//
//     const review = await step.run('compose-round-review', async () => {
//       // ... call your LLM composer with citation enforcement ...
//     });
//
//     await step.run('persist-review', async () => {
//       // ... upsert into golf_round_reviews ...
//     });
//
//     return { roundId: event.data.roundId, reviewId: review.id };
//   },
// );

export const functions = [weeklyHealthPing];
