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
import { archiveKnownResolvedIncidents } from '@/lib/admin/incident-resolver';
import { autoResolveFixedIncidents, type AutoResolveResult } from '@/lib/admin/auto-resolve';
import type { Database } from '@/lib/types/database';

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

/** Fail-soft wrapper — an auto-resolve bug/outage must never fail the
 *  retention cron's own purge work. Failure is logged, not thrown. */
async function runAutoResolve(): Promise<AutoResolveResult | { error: string }> {
  try {
    return await autoResolveFixedIncidents();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[log-retention] autoResolveFixedIncidents failed', message);
    return { error: message };
  }
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

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

    return NextResponse.json({
      ok: true,
      deleted,
      autoResolved: hygiene.archived,
      buckets: hygiene.buckets,
      releaseAutoResolve: autoResolve,
    });
  });
}
