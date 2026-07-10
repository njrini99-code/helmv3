/**
 * Vercel Cron handler that refreshes the `crm_coach_engagement` materialized
 * view by invoking the SECURITY DEFINER RPC `refresh_crm_coach_engagement()`.
 *
 * Schedule: every 5 minutes — see vercel.json `crons` entry.
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron sends
 *       this header automatically; do not trust `x-vercel-cron` alone since
 *       it is not stripped from inbound external traffic.
 *
 * The RPC itself wraps `REFRESH MATERIALIZED VIEW CONCURRENTLY` in a
 * pg_advisory_lock(7777) so concurrent ticks queue cleanly.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  // Now registered in vercel.json + CRON_REGISTRY (previously an orphaned
  // route the matview refresh never actually ran on in prod) — wrapped in
  // recordJobRun so the admin cron board can see it, matching every other
  // registered cron (enforced by cron-job-log-coverage.test.ts).
  return recordJobRun('refresh-engagement', async () => {
    try {
      const supabase = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('refresh_crm_coach_engagement');

      if (error) {
        await logServerError(
          `[cron.refresh-engagement] RPC failed: ${error.message}`,
          {
            action: 'cron.refresh_crm_coach_engagement',
            extra: { code: error.code },
          },
          'error',
        );
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        refreshed_at: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logServerError(
        `[cron.refresh-engagement] unexpected error: ${message}`,
        { action: 'cron.refresh_crm_coach_engagement' },
        'error',
      );
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
