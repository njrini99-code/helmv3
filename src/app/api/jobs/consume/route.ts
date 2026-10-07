/**
 * Helm Jobs consumer — GET /api/jobs/consume (Database Plan D6).
 *
 * Reads one small batch per queue (`coachhelm_analysis`, `email_send`,
 * `push_send`) from pgmq via the `helm_jobs_*` SECURITY DEFINER facades
 * (supabase/migrations/20260906140000_helm_jobs_pgmq_queues.sql, applied
 * in production — ledger-verified 2026-09-22, see HELD.md), runs the
 * matching handler, and acks or fails
 * each message. Handlers reuse the EXACT functions the inline paths already
 * call — `postRoundTrigger`, `sendEmailNotificationDirect`,
 * `sendPushNotificationDirect` — so a job processed here behaves
 * identically to one processed inline, including the email kill-switch
 * (see sendEmailNotificationDirect's own header).
 *
 * DEGRADES CLEANLY WHERE THE FACADES ARE MISSING (a fresh local stack, a
 * preview database): `isMigrationNotAppliedError` below (same idiom as
 * src/app/api/cron/helm-debug-prune/route.ts) turns that into a 200 no-op,
 * not a failed cron run.
 *
 * ONE DEPTH CHECK PER TICK, NOT THREE READS: nothing enqueues onto these
 * queues yet (HELM_QUEUE_ENABLED is off; on 2026-09-23 every queue's msg_id
 * sequence had never been called), yet the route ran three sequential
 * read_batch RPCs 1,440 times a day, and Sentry's N+1 detector filed the
 * pattern as an issue (~280 events/day). `helm_jobs_depth()` reports every
 * queue in one call, so an idle tick is one RPC and only queues that hold
 * messages are read. If the depth call itself fails, every queue is read
 * exactly as before — the gate may only skip work, never lose it. That
 * fallback also covers a stack built from origin/main alone: production runs
 * the corrected definition (20260909130000_helm_jobs_depth_qualify_queue,
 * verified live 2026-09-23), whose file is not on main yet (#1927).
 *
 * Schedule: every minute (see vercel.json, config/routines.yml,
 * src/lib/admin/cron-registry.ts). An alternative (pg_cron + pg_net,
 * supabase/migrations/20260906141000_...) is created but deliberately NOT
 * scheduled (confirmed inert 2026-09-22); do not run both.
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`, checked
 * by requireCronAuth — the same header a pg_cron+pg_net caller would send
 * per that alternative's design.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { describeError } from '@/lib/utils/describe-error';
import { logServerError } from '@/lib/server-error-logger';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';
import { sendEmailNotificationDirect } from '@/lib/notifications/email';
import { sendPushNotificationDirect } from '@/lib/notifications/push';
import type { NotificationType } from '@/lib/notifications/types';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const QUEUES = ['coachhelm_analysis', 'email_send', 'push_send'] as const;
type QueueName = (typeof QUEUES)[number];

const BATCH_SIZE = 20;
const VISIBILITY_SECONDS = 60;

interface MaybePostgrestError {
  code?: string | null;
  message?: string | null;
}

const MIGRATION_NOT_APPLIED_CODES = new Set(['PGRST202', '42883', '42P01', '3F000']);

function isMigrationNotAppliedError(error: MaybePostgrestError | null | undefined): boolean {
  if (!error) return false;
  if (MIGRATION_NOT_APPLIED_CODES.has(error.code ?? '')) return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist')) ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('schema') && message.includes('does not exist'))
  );
}

interface ReadRow {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: Record<string, unknown>;
}

interface QueueCounts {
  read: number;
  acked: number;
  failed: number;
  deadLettered: number;
}

async function handleMessage(queue: QueueName, message: Record<string, unknown>): Promise<void> {
  switch (queue) {
    case 'coachhelm_analysis': {
      const roundId = message.roundId as string;
      const playerId = message.playerId as string;
      const admin = createAdminClient();
      const result = await postRoundTrigger(admin, {
        playerId,
        roundId,
        triggerReason: 'round_submitted',
      });
      // R3: only a RETRYABLE failure is worth the queue's retry. A parked
      // outcome (under the floor, no roster, switched off) is an expected
      // state the trigger has already recorded on the round — failing the
      // message here would re-run the same expected state on every visibility
      // timeout. A permanent failure is stamped and logged with its exception;
      // re-running it would not change the answer.
      if (result.outcome?.kind === 'retryable_failure') {
        throw new Error(result.error ?? 'postRoundTrigger reported a retryable failure');
      }
      return;
    }
    case 'email_send': {
      const { type, recipientId, recipientEmail, data } = message as {
        type: NotificationType;
        recipientId: string;
        recipientEmail: string;
        data: Record<string, unknown>;
      };
      const result = await sendEmailNotificationDirect(type, recipientId, recipientEmail, data);
      if (!result.success) {
        throw new Error(result.error ?? 'sendEmailNotificationDirect reported failure');
      }
      return;
    }
    case 'push_send': {
      const { type, userId, data } = message as {
        type: NotificationType;
        userId: string;
        data: Record<string, unknown>;
      };
      const result = await sendPushNotificationDirect(type, userId, data);
      if (!result.success) {
        throw new Error(result.error ?? 'sendPushNotificationDirect reported failure');
      }
      return;
    }
    default: {
      const _exhaustive: never = queue;
      throw new Error(`unknown queue ${_exhaustive}`);
    }
  }
}

async function consumeQueue(
  admin: ReturnType<typeof createAdminClient>,
  queue: QueueName,
): Promise<QueueCounts | { skipped: string; code: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc('helm_jobs_read_batch', {
    p_queue: queue,
    p_n: BATCH_SIZE,
    p_visibility_seconds: VISIBILITY_SECONDS,
  });

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      return { skipped: 'migration-not-applied', code: error.code ?? 'unknown' };
    }
    throw new Error(`helm_jobs_read_batch(${queue}) failed: ${describeError(error)}`);
  }

  const rows = (data ?? []) as ReadRow[];
  const counts: QueueCounts = { read: rows.length, acked: 0, failed: 0, deadLettered: 0 };

  for (const row of rows) {
    try {
      await handleMessage(queue, row.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).rpc('helm_jobs_ack', { p_queue: queue, p_msg_id: row.msg_id });
      counts.acked += 1;
    } catch (err) {
      const errorText = describeError(err).slice(0, 2000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: failResult, error: failError } = await (admin as any).rpc('helm_jobs_fail', {
        p_queue: queue,
        p_msg_id: row.msg_id,
        p_error: errorText,
      });
      counts.failed += 1;
      if (failError) {
        // The message stays invisible until its visibility timeout, then re-reads; log so the retry is not silent.
        await logServerError(
          `helm_jobs: helm_jobs_fail rejected on queue ${queue}: ${describeError(failError)}`,
          { action: 'jobs.consume.failRpc', featureArea: 'jobs', extra: { queue, msgId: row.msg_id } },
          'warning',
        );
      }
      if ((failResult as { outcome?: string } | null)?.outcome === 'dead_lettered') {
        counts.deadLettered += 1;
        await logServerError(
          `helm_jobs: message dead-lettered on queue ${queue} after exhausting attempts: ${errorText}`,
          { action: 'jobs.consume.deadLetter', featureArea: 'jobs', extra: { queue, msgId: row.msg_id } },
          'warning',
        );
      }
    }
  }

  return counts;
}

interface DepthRow {
  queue: string;
  queue_length: number | string | null;
}

/**
 * The queues worth reading this tick, from one `helm_jobs_depth()` call.
 * Returns null when depth is unavailable (error, or a shape this code does
 * not recognise) so the caller falls back to reading every queue — skipping
 * on bad information could strand real messages, reading an empty queue
 * only costs one round trip.
 */
async function queuesWithMessages(
  admin: ReturnType<typeof createAdminClient>,
): Promise<QueueName[] | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc('helm_jobs_depth');
  if (error || !Array.isArray(data)) return null;
  const lengths = new Map<string, number>();
  for (const row of data as DepthRow[]) {
    const length = Number(row.queue_length);
    if (typeof row.queue !== 'string' || !Number.isFinite(length)) return null;
    lengths.set(row.queue, length);
  }
  // A queue the depth call did not report is read anyway, for the same reason.
  return QUEUES.filter((queue) => (lengths.get(queue) ?? 1) > 0);
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('jobs-consume', async () => {
    const admin = createAdminClient();
    const results: Record<string, QueueCounts | { skipped: string; code: string }> = {};

    const toRead = (await queuesWithMessages(admin)) ?? QUEUES;
    for (const queue of QUEUES) {
      if (!toRead.includes(queue)) {
        results[queue] = { read: 0, acked: 0, failed: 0, deadLettered: 0 };
        continue;
      }
      results[queue] = await consumeQueue(admin, queue);
    }

    return NextResponse.json({ ok: true, results });
  });
}
