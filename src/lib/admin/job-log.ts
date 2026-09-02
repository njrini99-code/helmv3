import { createAdminClient } from '@/lib/supabase/admin';
import { logServerEvent } from '@/lib/server-error-logger';
import { scheduleBridgeWrite } from '@/lib/admin/schedule-bridge-write';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Capture class #4 — cron/job outcomes into background_job_logs (the empty
 * scaffold, prod_public_baseline.sql:7314-7325: job_type, status,
 * duration_ms, error_message, retry_count, metadata, started_at,
 * completed_at). SUCCESSES are logged too — a board that only shows
 * failures cannot distinguish healthy from dead.
 *
 * Self-swallowing: a logging failure (e.g. background_job_logs itself is
 * unreachable) must NEVER fail the cron. The original result or thrown error
 * from `fn` always passes through unchanged. The admin_events write is
 * scheduled past the response (`scheduleBridgeWrite`), not `void`ed — a
 * detached promise is dropped once a serverless response is sent.
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
      await scheduleBridgeWrite(() =>
        logServerEvent(
          `Cron failed: ${jobType}`,
          { action: `cron.${jobType}`, source: 'cron', errorDetails: message },
          'error',
        ),
      );
      return result;
    }
    const metadata =
      result instanceof Response ? await extractOutcomeMetadata(result) : null;
    await writeRow(jobType, 'completed', startedAt, null, metadata);
    return result;
  } catch (err) {
    // A cron that fetches an unreachable upstream throws with the gateway's
    // HTML error page as its message, and `String(err)` on a Supabase-shaped
    // plain object is the useless '[object Object]' — so neither raw form is
    // safe to store. See summariseErrorBody / describeError.
    const message = summariseErrorBody(describeError(err));
    await writeRow(jobType, 'failed', startedAt, message);
    await scheduleBridgeWrite(() =>
      logServerEvent(
        `Cron failed: ${jobType}`,
        { action: `cron.${jobType}`, source: 'cron', errorDetails: message },
        'error',
      ),
    );
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
          return summariseErrorBody(candidate, response.status);
        }
      }
      return `HTTP ${response.status}`;
    }
    const text = await clone.text();
    return text.trim() ? summariseErrorBody(text, response.status) : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Reduce an upstream error body to one readable line.
 *
 * When a gateway between us and an upstream fails, the body is an HTML error
 * PAGE, not a message. Storing it verbatim is what happened on 2026-07-21:
 * `Cron failed: coachhelm-validation` carried 2000 characters of Cloudflare
 * markup (`<!DOCTYPE html>`, conditional-comment IE shims, a stylesheet link…)
 * as its `errorDetails`, so the one fact an operator needed — Supabase was
 * unreachable, error 522 — was buried in boilerplate in both admin_events and
 * background_job_logs.
 *
 * Such a page always states its cause in `<title>` (here, verbatim:
 * "supabase.co | 522: Connection timed out"), so keep the title and drop the
 * document. Non-HTML bodies are already messages: collapse their whitespace
 * and cap them.
 *
 * Never throws — this runs on a path that must not fail a cron.
 */
export function summariseErrorBody(body: string, status?: number): string {
  const text = body.trim();
  const prefix = status !== undefined ? `HTTP ${status}` : null;

  // Anchor on the START of the body: a document declares itself in its first
  // bytes. Matching `<html` anywhere would also catch a genuine message that
  // merely quotes a tag ("failed to parse <html> in user input"). Leading
  // comments are skipped because a Cloudflare page opens with IE shims.
  const head = text.replace(/^(?:\s|<!--[\s\S]*?-->)+/, '');
  if (/^<(?:!doctype\s|html[\s>]|\?xml)/i.test(head)) {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i
      .exec(text)?.[1]
      ?.replace(/\s+/g, ' ')
      .trim();
    const detail = title && title.length > 0 ? title : 'HTML error page (no title)';
    return [prefix, detail].filter(Boolean).join(' — ').slice(0, 300);
  }

  return text.replace(/\s+/g, ' ').slice(0, 2000);
}

/** Guard rails, so a pathological body cannot bloat the row. */
const MAX_METADATA_KEYS = 24;
const MAX_METADATA_STRING = 300;

/**
 * Best-effort outcome snapshot from a successful cron Response body, stored in
 * background_job_logs.metadata so the admin cron board can distinguish "ran and
 * did work" from "self-skipped" (e.g. ingest-gmail-replies returns
 * `{skipped: 'not-armed'}` until its Google scope is granted — without this,
 * both outcomes log as a bare 'completed').
 *
 * TAKES EVERY TOP-LEVEL SCALAR, BOUNDED. It used to whitelist seven key names —
 * skipped, matched, inserted, sent, processed, count, detail — which meant a
 * route only got metadata if it happened to name its fields from that
 * vocabulary. Measured over 30 days, 11 of the 19 live job types logged
 * `metadata = null` on every single run:
 *
 *     refresh-engagement, event-reminders, log-retention, integrity-check,
 *     v3-goal-suggestions-evaluate, coachhelm-insight-lifecycle,
 *     coachhelm-calibration, v3-goal-suggestions-write,
 *     v3-causality-attribute, v3-genome-nightly, v3-standing-refresh
 *
 * Every one of them returns useful scalars. None uses a whitelisted name, and
 * `event-reminders` misses by a hair — it reports `inserted24h` where the list
 * had `inserted`.
 *
 * WHAT THAT COST. `v3-genome-nightly` reported `completed` 47 times across six
 * weeks while writing nothing; `golf_player_genome` sat frozen at 2026-07-07.
 * It returns `{ players_in_chunk, per_player, duration_ms }` — no whitelisted
 * key — so every row logged `metadata: null`, and the only evidence anything
 * was wrong was a ~1,039 ms duration that could not have rebuilt 25 genomes.
 * A job that did nothing was indistinguishable from a job that did everything.
 *
 * A fixed vocabulary every future route must coincidentally adopt is the same
 * shape as the dead metric map in #1488: a lookup table written against values
 * production does not emit. Bounding the output is the real constraint, so the
 * caps above do that directly and the key names are left to the routes.
 *
 * Scalars only — arrays and nested objects are still dropped, which is what
 * keeps `per_player: [...]` and friends out of the row. Never throws.
 */
async function extractOutcomeMetadata(
  response: Response,
): Promise<Record<string, string | number | boolean> | null> {
  try {
    const clone = response.clone();
    if (!(clone.headers.get('content-type') ?? '').includes('application/json')) return null;
    const body: unknown = await clone.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const outcome: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (Object.keys(outcome).length >= MAX_METADATA_KEYS) break;
      if (typeof value === 'string') outcome[key] = value.slice(0, MAX_METADATA_STRING);
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
  metadata: Record<string, string | number | boolean> | null = null,
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
