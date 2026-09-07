/**
 * Helm Jobs — producer side of the pgmq durable job queue (Database Plan D6).
 *
 * `enqueueJob()` is the ONE call site every job producer (round-submit,
 * email send, push send) is meant to route through. It is fail-open by
 * design in three independent ways, and a caller must never treat a
 * `{ queued: false }` result as an error — it means "run your existing
 * inline/Inngest path instead," which every current caller already has:
 *
 *   1. `HELM_QUEUE_ENABLED` unset/false — the queue is off by default until
 *      the owner applies `20260906140000_helm_jobs_pgmq_queues.sql` AND
 *      flips the flag. Documented in `.env.example`.
 *   2. The pgmq facade migration is not applied yet — `helm_jobs_enqueue`
 *      does not exist in this database. Detected by Postgres/PostgREST
 *      error codes (`42883` undefined function, `PGRST202` no matching
 *      function in schema cache), not by a generic catch-all, so a REAL
 *      failure (bad payload, RLS-adjacent denial, network error) still
 *      surfaces to the caller's own error handling instead of being
 *      silently swallowed as "not configured."
 *   3. Any other unexpected error calling the facade — reported via
 *      logServerError so a live production issue is visible, but still
 *      resolved as `{ queued: false }` so the caller's fallback runs. A
 *      job that fails to enqueue must never be a job that never ran at all.
 *
 * Idempotency: pass `dedupeKey` when the caller can compute one (e.g.
 * `round:${roundId}:analysis`); `helm_jobs_enqueue`'s SQL-side dedupe
 * collapses repeat calls with the same key inside a rolling 24h window into
 * the original message, so a duplicate `enqueueJob` call (retried request,
 * re-run cron) never double-processes the same unit of work.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

export type HelmJobsQueue = 'coachhelm_analysis' | 'email_send' | 'push_send';

export interface EnqueueJobOptions {
  dedupeKey?: string;
}

export type EnqueueJobResult =
  | { queued: true; msgId: number }
  | { queued: false; reason: 'queue_disabled' | 'facade_missing' | 'enqueue_failed' };

/**
 * Missing-facade error codes across the two client paths this repo uses to
 * reach the same RPC: the admin (service-role) Supabase client goes through
 * PostgREST (`PGRST202`), a hypothetical direct-Postgres path would surface
 * plain `42883` (undefined function). Checking both keeps this detector
 * correct regardless of which client shape calls it.
 */
const MIGRATION_NOT_APPLIED_CODES = new Set(['42883', 'PGRST202', '42P01', '3F000']);

function isFacadeMissingError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code && MIGRATION_NOT_APPLIED_CODES.has(error.code)) return true;
  const message = error.message ?? '';
  return /does not exist|schema cache|function.*helm_jobs_enqueue/i.test(message);
}

function isQueueEnabled(): boolean {
  return process.env.HELM_QUEUE_ENABLED === 'true';
}

/**
 * Enqueue a durable job. Fails open — see the file header. Never throws;
 * every error path resolves to `{ queued: false, reason }`.
 */
export async function enqueueJob(
  queue: HelmJobsQueue,
  payload: Record<string, unknown>,
  options: EnqueueJobOptions = {},
): Promise<EnqueueJobResult> {
  if (!isQueueEnabled()) {
    return { queued: false, reason: 'queue_disabled' };
  }

  try {
    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('helm_jobs_enqueue', {
      p_queue: queue,
      p_payload: payload,
      p_dedupe_key: options.dedupeKey ?? null,
    });

    if (error) {
      if (isFacadeMissingError(error)) {
        return { queued: false, reason: 'facade_missing' };
      }
      await logServerError(
        `enqueueJob(${queue}) failed: ${error.message ?? 'unknown error'}`,
        {
          action: 'jobs.enqueue',
          featureArea: 'jobs',
          extra: { queue, code: error.code, dedupeKey: options.dedupeKey },
        },
        'warning',
      );
      return { queued: false, reason: 'enqueue_failed' };
    }

    const msgId = typeof data === 'number' ? data : Number(data);
    if (!Number.isFinite(msgId)) {
      return { queued: false, reason: 'enqueue_failed' };
    }
    return { queued: true, msgId };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (isFacadeMissingError({ code, message: describeError(err) })) {
      return { queued: false, reason: 'facade_missing' };
    }
    await logServerError(
      `enqueueJob(${queue}) threw: ${describeError(err)}`,
      {
        action: 'jobs.enqueue',
        featureArea: 'jobs',
        extra: { queue, dedupeKey: options.dedupeKey, stack: err instanceof Error ? err.stack : undefined },
      },
      'warning',
    );
    return { queued: false, reason: 'enqueue_failed' };
  }
}

/** True only when HELM_QUEUE_ENABLED=true — callers use this to decide
 * whether to attempt enqueueJob at all before falling to Inngest/direct. */
export function isHelmQueueEnabled(): boolean {
  return isQueueEnabled();
}
