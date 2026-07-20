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
    // A resolved (not thrown) Response/NextResponse with a 4xx/5xx status is
    // still a failed run — most cron routes catch internally and return an
    // error JSON rather than throwing. clone() before reading so the caller
    // (Vercel Cron / the HTTP layer) can still consume the original body.
    if (result instanceof Response && result.status >= 400) {
      const message = await extractResponseErrorLine(result);
      await writeRow(jobType, 'failed', startedAt, message);
      try {
        void logServerEvent(
          `Cron failed: ${jobType}`,
          { action: `cron.${jobType}`, source: 'cron', errorDetails: message },
          'error',
        ).catch(() => {});
      } catch {
        /* never mask the real failure */
      }
      return result;
    }
    const metadata =
      result instanceof Response ? await extractOutcomeMetadata(result) : null;
    await writeRow(jobType, 'completed', startedAt, null, metadata);
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

/** Best-effort short error line from a failed Response's body — never throws. */
async function extractResponseErrorLine(response: Response): Promise<string> {
  try {
    const clone = response.clone();
    const contentType = clone.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body: unknown = await clone.json();
      if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        const candidate = record.error ?? record.message;
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate.slice(0, 2000);
        }
      }
      return `HTTP ${response.status}`;
    }
    const text = await clone.text();
    return text.trim() ? text.slice(0, 2000) : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Best-effort outcome snapshot from a successful cron Response body, stored in
 * background_job_logs.metadata so the admin cron board can distinguish "ran
 * and did work" from "self-skipped" (e.g. ingest-gmail-replies returns
 * `{skipped: 'not-armed'}` until its Google scope is granted — without this,
 * both outcomes log as a bare 'completed'). Whitelisted keys only; never throws.
 */
async function extractOutcomeMetadata(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    const clone = response.clone();
    if (!(clone.headers.get('content-type') ?? '').includes('application/json')) return null;
    const body: unknown = await clone.json();
    if (!body || typeof body !== 'object') return null;
    const record = body as Record<string, unknown>;
    const outcome: Record<string, unknown> = {};
    for (const key of ['skipped', 'matched', 'inserted', 'sent', 'processed', 'count', 'detail']) {
      const value = record[key];
      if (typeof value === 'string') outcome[key] = value.slice(0, 300);
      else if (typeof value === 'number' || typeof value === 'boolean') outcome[key] = value;
    }
    return Object.keys(outcome).length > 0 ? outcome : null;
  } catch {
    return null;
  }
}

async function writeRow(
  jobType: string,
  status: 'completed' | 'failed',
  startedAt: Date,
  errorMessage: string | null,
  metadata: Record<string, unknown> | null = null,
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
      ...(metadata ? { metadata } : {}),
    });
  } catch {
    // Fire-and-forget: outcome logging must never fail a cron.
  }
}
