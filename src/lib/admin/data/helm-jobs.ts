/**
 * Bridge Jobs board — "Jobs queue" section (Database Plan D6).
 *
 * Reads pgmq queue depth/dead-letters through the `helm_jobs_*`
 * SECURITY DEFINER facades (supabase/migrations/
 * 20260906140000_helm_jobs_pgmq_queues.sql, HELD). Fails open to an empty
 * state — never throws — when the facade migration is not applied yet, the
 * same idiom every other `helm_debug_*`/`helm_jobs_*` reader in this repo
 * uses (see src/app/api/cron/helm-debug-prune/route.ts's header for the
 * canonical explanation).
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { redactPiiDeep } from '@/lib/observability/redact-pii';
import { describeError } from '@/lib/utils/describe-error';

export interface HelmJobsQueueDepth {
  queue: string;
  queueLength: number;
  oldestMsgAgeSeconds: number | null;
  deadLetterCount: number;
}

export interface HelmJobsDeadLetter {
  id: string;
  queue: string;
  msgId: number | null;
  payload: unknown;
  error: string | null;
  attempts: number;
  firstEnqueuedAt: string | null;
  failedAt: string;
}

export interface HelmJobsQueueStatus {
  available: boolean;
  reason?: string;
  depths: HelmJobsQueueDepth[];
  deadLetters: HelmJobsDeadLetter[];
}

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
    (message.includes('relation') && message.includes('does not exist'))
  );
}

const EMPTY_STATUS: HelmJobsQueueStatus = { available: false, depths: [], deadLetters: [] };

export async function fetchHelmJobsQueueStatus(): Promise<HelmJobsQueueStatus> {
  try {
    const admin = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depthResult = await (admin as any).rpc('helm_jobs_depth');
    if (depthResult.error) {
      if (isMigrationNotAppliedError(depthResult.error)) {
        return { ...EMPTY_STATUS, reason: 'migration-not-applied' };
      }
      return { ...EMPTY_STATUS, reason: `depth read failed: ${describeError(depthResult.error)}` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deadLetterResult = await (admin as any).rpc('helm_jobs_list_dead_letters', {
      p_queue: null,
      p_limit: 50,
    });
    const rawDeadLetters = deadLetterResult.error ? [] : (deadLetterResult.data ?? []);

    const depths: HelmJobsQueueDepth[] = (depthResult.data ?? []).map(
      (row: { queue: string; queue_length: number; oldest_msg_age_seconds: number | null; dead_letter_count: number }) => ({
        queue: row.queue,
        queueLength: row.queue_length,
        oldestMsgAgeSeconds: row.oldest_msg_age_seconds,
        deadLetterCount: row.dead_letter_count,
      }),
    );

    const deadLetters: HelmJobsDeadLetter[] = rawDeadLetters.map(
      (row: {
        id: string;
        queue: string;
        msg_id: number | null;
        payload: unknown;
        error: string | null;
        attempts: number;
        first_enqueued_at: string | null;
        failed_at: string;
      }) => ({
        id: row.id,
        queue: row.queue,
        msgId: row.msg_id,
        // PII/secret hygiene: a job payload can carry recipient emails/ids —
        // never render one to the Bridge unredacted.
        payload: redactPiiDeep(row.payload),
        error: row.error,
        attempts: row.attempts,
        firstEnqueuedAt: row.first_enqueued_at,
        failedAt: row.failed_at,
      }),
    );

    return { available: true, depths, deadLetters };
  } catch (err) {
    return { ...EMPTY_STATUS, reason: describeError(err) };
  }
}
