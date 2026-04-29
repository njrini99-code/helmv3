/**
 * Vercel Cron handler that refreshes the `crm_coach_engagement` materialized
 * view by invoking the SECURITY DEFINER RPC `refresh_crm_coach_engagement()`.
 *
 * Schedule: every 5 minutes — see vercel.json `crons` entry.
 * Auth: accepts either Vercel's automatic `x-vercel-cron` header (set by the
 *       platform) or `Authorization: Bearer ${CRON_SECRET}` for manual /
 *       monitoring invocations.
 *
 * The RPC itself wraps `REFRESH MATERIALIZED VIEW CONCURRENTLY` in a
 * pg_advisory_lock(7777) so concurrent ticks queue cleanly.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const isVercelCron = request.headers.get('x-vercel-cron') !== null;
  const authHeader = request.headers.get('authorization');
  const expectedAuth = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;

  if (!isVercelCron && (!expectedAuth || authHeader !== expectedAuth)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
}
