/**
 * Log-retention cron — GET /api/cron/log-retention
 *
 * Ships in the SAME wave as the new background_job_logs write volume (W11
 * risk #8 rule: retention lands alongside the write path it's bounding, not
 * after the table has already grown unbounded).
 *
 * Retention policy:
 *   - admin_events / error_logs: info/warning rows older than 90d, error/
 *     critical rows older than 13mo (13mo is the forensic window — long
 *     enough to span a fiscal-year-over-year comparison).
 *   - background_job_logs: all rows older than 90d (cron outcomes are
 *     operational, not forensic).
 *
 * Bounded-batch delete: each purge selects up to BATCH rows (oldest first),
 * deletes them, and repeats up to MAX_BATCHES times per call — so a 90k-row
 * backlog never issues one long-locking DELETE against a shared prod table.
 * A backlog larger than BATCH * MAX_BATCHES per policy drains over
 * subsequent nightly runs rather than blowing the function's maxDuration.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: `30 7 * * *` (see vercel.json) — 30 minutes after integrity-check.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/admin/job-log';
import { SELFHEAL_CLOSE_JOB_TYPE } from '@/lib/admin/selfheal-registry';
import { archiveKnownResolvedIncidents } from '@/lib/admin/incident-resolver';
import { autoResolveFixedIncidents, type AutoResolveResult } from '@/lib/admin/auto-resolve';
import type { Database } from '@/lib/types/database';
import { requireCronAuth } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * BATCH must not exceed PostgREST's per-request row cap (1,000). At the old
 * 5,000 the cap silently truncated every page to 1,000, which is < BATCH, so
 * `purgeBatch` read that as "short page = backlog drained" and returned after
 * one pass — capping the purge at 1,000 rows/run instead of the intended
 * 100k. MAX_BATCHES is raised to keep that documented 100k/run ceiling.
 */
const BATCH = 1000;
const MAX_BATCHES = 100;
/**
 * Ceiling on ids per `.in('id', [...])` delete. PostgREST filters live in the
 * query string (~39 bytes per uuid) and Supabase's edge rejects an over-long
 * URI before Postgres sees it — measured on this project 2026-07-31, 584 ids
 * (~22.8 KB) is the last size that works and 585 returns a bare
 * `400 Bad Request`. A full 1,000-id page would be ~39 KB, so every delete
 * MUST be chunked. This is the same defect that had been failing Rule C of
 * auto-resolve nightly (see ID_CHUNK_SIZE in src/lib/admin/auto-resolve.ts);
 * here it was merely unfired, because so few rows were ever purge-eligible
 * in one night.
 */
const DELETE_CHUNK_SIZE = 200;

type AdminClient = ReturnType<typeof createAdminClient>;
type AdminEventSeverity = Database['public']['Enums']['admin_event_severity'];

/**
 * Bounded-batch delete: repeatedly selects up to BATCH victim ids (via
 * `fetchPage`, which the caller re-issues each iteration — already-deleted
 * rows naturally fall out of the next page) and deletes them (via
 * `deletePage`), until a short page signals the backlog is drained or
 * MAX_BATCHES is hit for this run.
 */
async function purgeBatch(
  fetchPage: () => PromiseLike<{ data: Array<{ id: string }> | null; error: { message: string } | null }>,
  deletePage: (ids: string[]) => PromiseLike<{ error: { message: string } | null }>,
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await fetchPage();
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((row) => row.id);
    if (ids.length === 0) return deleted;
    // Chunked: a whole page of ids in one `.in()` overflows the request URI
    // and fails with `400 Bad Request`. See DELETE_CHUNK_SIZE.
    for (let j = 0; j < ids.length; j += DELETE_CHUNK_SIZE) {
      const { error: deleteError } = await deletePage(ids.slice(j, j + DELETE_CHUNK_SIZE));
      if (deleteError) throw new Error(deleteError.message);
    }
    deleted += ids.length;
    if (ids.length < BATCH) return deleted;
  }
  return deleted;
}

function purgeAdminEvents(admin: AdminClient, severities: AdminEventSeverity[], before: string): Promise<number> {
  return purgeBatch(
    () =>
      admin
        .from('admin_events')
        .select('id')
        .in('severity', severities)
        .lt('created_at', before)
        .order('created_at', { ascending: true })
        .limit(BATCH),
    (ids) => admin.from('admin_events').delete().in('id', ids),
  );
}

function purgeErrorLogsBySeverity(admin: AdminClient, severities: string[], before: string): Promise<number> {
  return purgeBatch(
    () =>
      admin
        .from('error_logs')
        .select('id')
        .in('severity', severities)
        .lt('timestamp', before)
        .order('timestamp', { ascending: true })
        .limit(BATCH),
    (ids) => admin.from('error_logs').delete().in('id', ids),
  );
}

function purgeErrorLogsBefore(admin: AdminClient, before: string): Promise<number> {
  return purgeBatch(
    () =>
      admin
        .from('error_logs')
        .select('id')
        .lt('timestamp', before)
        .order('timestamp', { ascending: true })
        .limit(BATCH),
    (ids) => admin.from('error_logs').delete().in('id', ids),
  );
}

function purgeJobLogsBefore(admin: AdminClient, before: string): Promise<number> {
  return purgeBatch(
    () =>
      admin
        .from('background_job_logs')
        .select('id')
        .lt('started_at', before)
        .order('started_at', { ascending: true })
        .limit(BATCH),
    (ids) => admin.from('background_job_logs').delete().in('id', ids),
  );
}

/**
 * Fail-soft wrapper — an auto-resolve bug/outage must never fail the retention
 * cron's own purge work. Failure is logged, not thrown.
 *
 * WHY THE INNER `recordJobRun`. Auto-resolution IS the self-healing loop's
 * CLOSE stage, and it used to have no heartbeat of its own: `SELFHEAL_STAGES`
 * read `log-retention`'s. But this function exists precisely to let
 * auto-resolve fail while retention carries on, so the route still returned
 * 200 and recorded `log-retention` = 'completed' — and the Self-Heal circuit
 * read a closed loop off a heartbeat belonging to different work. Retention
 * succeeding is not evidence about Close.
 *
 * `recordJobRun` writes 'failed' and RETHROWS, so the catch stays OUTSIDE it:
 * the throw is what marks the close run failed, and catching here is what
 * keeps retention independent. Catching inside would write 'completed' and
 * rebuild the same false-green one layer down.
 *
 * No new Vercel schedule — the same nightly invocation now reports two facts
 * instead of one.
 */
async function runAutoResolve(): Promise<AutoResolveResult | { error: string }> {
  try {
    return await recordJobRun(SELFHEAL_CLOSE_JOB_TYPE, () => autoResolveFixedIncidents());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[log-retention] autoResolveFixedIncidents failed', message);
    return { error: message };
  }
}

export async function GET(req: NextRequest) {
  // Constant-time secret comparison. The inline `!==` this replaces
  // short-circuits at the first differing byte, so response latency leaks a
  // prefix-match oracle against CRON_SECRET. `cronSecretMatches` compares
  // buffer lengths first (timingSafeEqual THROWS on a length mismatch) and
  // still fails closed when the secret is unset.
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('log-retention', async () => {
    const admin = createAdminClient();
    const ago90d = new Date(Date.now() - 90 * 86400_000).toISOString();
    const ago13mo = new Date(Date.now() - 396 * 86400_000).toISOString();

    const hygiene = await archiveKnownResolvedIncidents();
    const autoResolve = await runAutoResolve();

    let deleted = 0;
    deleted += await purgeAdminEvents(admin, ['info', 'warning'], ago90d);
    deleted += await purgeAdminEvents(admin, ['error', 'critical'], ago13mo);
    deleted += await purgeErrorLogsBySeverity(admin, ['info', 'warning'], ago90d);
    deleted += await purgeErrorLogsBefore(admin, ago13mo);
    deleted += await purgeJobLogsBefore(admin, ago90d);

    // Flatten the resolution-lifecycle outcome into TOP-LEVEL SCALARS.
    //
    // `recordJobRun`'s `extractOutcomeMetadata` (src/lib/admin/job-log.ts)
    // keeps only top-level string/number/boolean fields and silently drops
    // objects and arrays — so `releaseAutoResolve` below (kept for anyone
    // reading the raw HTTP response) never reaches background_job_logs.metadata,
    // and the cron board would show `completed` regardless of whether the
    // ledger/regression writes actually succeeded. That is the exact shape of
    // invisibility INC-2026-08-27 was about: a discarded reason, not a missing
    // count. See memory/features/admin-platform.md.
    const autoResolveFailed = 'error' in autoResolve;
    const ledger = autoResolveFailed
      ? { recorded: 0, skippedManual: 0, failed: 0, capped: 0, firstError: autoResolve.error }
      : autoResolve.ledger;
    const regressions = autoResolveFailed
      ? { marked: 0, failed: 0, capped: 0, firstError: null }
      : autoResolve.regressions;
    const regressionSkippedReason = autoResolveFailed ? undefined : autoResolve.regressionSkippedReason;

    // DELIBERATELY still 200/`ok: true`, even when ledger or regression writes
    // failed. This route's contract (see purgeBatch above and the sibling
    // event-reminders cron) is that a retryable per-fingerprint failure is not
    // a reason to fail the whole run — recordAutoResolutions/markRegressions
    // already isolate one RPC failure from the rest of the batch, and this
    // pass's misses are simply re-decided next night from fresh occurrence
    // data. `degraded` carries the honest signal instead of the status code.
    //
    // `regressionSkippedReason` counts too: unlike `releaseSkippedReason`
    // (Rule A benignly not firing until a deploy is 24h old),
    // `regressionSkippedReason`'s one assignment site in auto-resolve.ts is a
    // FAILED resolutions read — regression detection never ran, so "nothing
    // regressed" was never established. Reporting that pass as `degraded:
    // false` is exactly the unknown→healthy collapse the OS contract bans;
    // see memory/features/admin-platform.md "A source that could not be read
    // is never reported as zero problems."
    const degraded =
      autoResolveFailed || ledger.failed > 0 || regressions.failed > 0 || regressionSkippedReason !== undefined;

    return NextResponse.json({
      ok: true,
      degraded,
      deleted,
      autoResolved: hygiene.archived,
      buckets: hygiene.buckets,
      releaseAutoResolve: autoResolve,
      ledgerRecorded: ledger.recorded,
      ledgerSkippedManual: ledger.skippedManual,
      ledgerFailed: ledger.failed,
      ledgerCapped: ledger.capped,
      ...(ledger.firstError ? { ledgerFirstError: ledger.firstError } : {}),
      regressionsMarked: regressions.marked,
      regressionsFailed: regressions.failed,
      regressionsCapped: regressions.capped,
      ...(regressions.firstError ? { regressionsFirstError: regressions.firstError } : {}),
      ...(regressionSkippedReason ? { regressionSkippedReason } : {}),
    });
  });
}
