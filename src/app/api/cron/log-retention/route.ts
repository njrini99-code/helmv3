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
import type { Database } from '@/lib/types/database';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BATCH = 5000;
const MAX_BATCHES = 20;

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
    const { error: deleteError } = await deletePage(ids);
    if (deleteError) throw new Error(deleteError.message);
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

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  return recordJobRun('log-retention', async () => {
    const admin = createAdminClient();
    const ago90d = new Date(Date.now() - 90 * 86400_000).toISOString();
    const ago13mo = new Date(Date.now() - 396 * 86400_000).toISOString();

    let deleted = 0;
    deleted += await purgeAdminEvents(admin, ['info', 'warning'], ago90d);
    deleted += await purgeAdminEvents(admin, ['error', 'critical'], ago13mo);
    deleted += await purgeErrorLogsBySeverity(admin, ['info', 'warning'], ago90d);
    deleted += await purgeErrorLogsBefore(admin, ago13mo);
    deleted += await purgeJobLogsBefore(admin, ago90d);

    return NextResponse.json({ ok: true, deleted });
  });
}
