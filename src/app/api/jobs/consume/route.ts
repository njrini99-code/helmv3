/**
 * Helm Jobs consumer — GET /api/jobs/consume (Database Plan D6).
 *
 * Reads one small batch per queue (`coachhelm_analysis`, `email_send`,
 * `push_send`) from pgmq via the `helm_jobs_*` SECURITY DEFINER facades
 * (supabase/migrations/20260906140000_helm_jobs_pgmq_queues.sql, HELD —
 * see that file's header), runs the matching handler, and acks or fails
 * each message. Handlers reuse the EXACT functions the inline paths already
 * call — `postRoundTrigger`, `sendEmailNotificationDirect`,
 * `sendPushNotificationDirect` — so a job processed here behaves
 * identically to one processed inline, including the email kill-switch
 * (see sendEmailNotificationDirect's own header).
 *
 * DEGRADES CLEANLY WHILE THE MIGRATION IS HELD: the facade RPCs do not
 * exist in production until an owner applies the migration (see HELD.md).
 * `isMigrationNotAppliedError` below (same idiom as
 * src/app/api/cron/helm-debug-prune/route.ts) turns that into a 200 no-op,
 * not a failed cron run — this route is not useful until the migration
 * ships, and that is an expected, not exceptional, state.
 *
 * Schedule: every minute (see vercel.json, config/routines.yml,
 * src/lib/admin/cron-registry.ts). A HELD alternative
 * (pg_cron + pg_net, supabase/migrations/20260906141000_...) exists for the
 * owner to switch to later; do not run both.
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`, checked
 * by requireCronAuth — the same header a pg_cron+pg_net caller would send
 * per that HELD migration's design.
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
      if (!result.success) {
        throw new Error(result.error ?? 'postRoundTrigger reported failure');
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
      const { data: failResult } = await (admin as any).rpc('helm_jobs_fail', {
        p_queue: queue,
        p_msg_id: row.msg_id,
        p_error: errorText,
      });
      counts.failed += 1;
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

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('jobs-consume', async () => {
    const admin = createAdminClient();
    const results: Record<string, QueueCounts | { skipped: string; code: string }> = {};

    for (const queue of QUEUES) {
      results[queue] = await consumeQueue(admin, queue);
    }

    return NextResponse.json({ ok: true, results });
  });
}
