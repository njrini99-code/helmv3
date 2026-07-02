import { createAdminClient } from '@/lib/supabase/admin';
import { logServerEvent } from '@/lib/server-error-logger';

/**
 * Capture class #4 — cron/job outcomes into background_job_logs (the empty
 * scaffold, prod_public_baseline.sql:7314-7325: job_type, status,
 * duration_ms, error_message, retry_count, metadata, started_at,
 * completed_at). SUCCESSES are logged too — a board that only shows
 * failures cannot distinguish healthy from dead.
 *
 * Fire-and-forget-swallowed: a logging failure (e.g. background_job_logs
 * itself is unreachable) must NEVER fail the cron. The original result or
 * thrown error from `fn` always passes through unchanged.
 *
 * Noise discipline: successes write ONLY to background_job_logs (the cron
 * board reads that table). Only FAILURES also write an admin_events
 * `source='cron'` row via logServerEvent — successes stay out of the event
 * feed, since the routes already log their own summaries.
 */
export async function recordJobRun<T>(jobType: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = new Date();
  try {
    const result = await fn();
    await writeRow(jobType, 'completed', startedAt, null);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeRow(jobType, 'failed', startedAt, message.slice(0, 2000));
    try {
      void logServerEvent(
        `Cron failed: ${jobType}`,
        { action: `cron.${jobType}`, source: 'cron', errorDetails: message.slice(0, 2000) },
        'error',
      ).catch(() => {});
    } catch {
      /* never mask the real failure */
    }
    throw err;
  }
}

async function writeRow(
  jobType: string,
  status: 'completed' | 'failed',
  startedAt: Date,
  errorMessage: string | null,
): Promise<void> {
  try {
    const completedAt = new Date();
    const admin = createAdminClient();
    await admin.from('background_job_logs').insert({
      job_type: jobType,
      status,
      duration_ms: completedAt.getTime() - startedAt.getTime(),
      error_message: errorMessage,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
    });
  } catch {
    // Fire-and-forget: outcome logging must never fail a cron.
  }
}
