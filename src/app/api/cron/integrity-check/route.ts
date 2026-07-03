/**
 * Nightly data-integrity cron — GET /api/cron/integrity-check
 *
 * Calls the SECURITY DEFINER `run_integrity_checks()` RPC (service_role-only
 * EXECUTE — supabase/migrations/20260701150000_run_integrity_checks_rpc.sql,
 * already applied to prod). It runs five checks: orphaned golf team members,
 * stats-cache rows referencing deleted players, Bridge schema canaries
 * (recorded-but-unapplied migrations), anon-grant drift on the six
 * Bridge-sensitive tables, and (20260704130000_integrity_check_admin_
 * readability_tripwire.sql) `admin_count_vs_list_readability` — every table
 * the admin UI reads with the browser client (demo_requests + the crm_*
 * tables + email_events) must have ≥1 SELECT/ALL policy that actually
 * applies to `authenticated`, catching the "badge counts N, list shows 0"
 * RLS class where a count RPC (RLS-exempt) and a browser-client list query
 * silently disagree.
 *
 * Noise discipline: EVERY check writes an `admin_events` `source='integrity'`
 * row so /admin/jobs can always show "latest per check", but only FAILING
 * checks go in at severity `error` (which feeds the W5 banner). Passing
 * checks are `info` + `skipSentry` — quiet, discoverable, never alarming.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: `0 7 * * *` (see vercel.json).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/admin/job-log';
import { logServerEvent } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

interface CheckResult {
  check: string;
  status: 'pass' | 'fail';
  count: number;
  sample: unknown[];
}

function isCheckResult(value: unknown): value is CheckResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.check === 'string' &&
    (v.status === 'pass' || v.status === 'fail') &&
    typeof v.count === 'number' &&
    Array.isArray(v.sample)
  );
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  return recordJobRun('integrity-check', async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('run_integrity_checks');
    if (error) throw new Error(`run_integrity_checks failed: ${error.message}`);

    const raw: unknown = data;
    const checks: CheckResult[] = Array.isArray(raw) ? raw.filter(isCheckResult) : [];

    for (const check of checks) {
      await logServerEvent(
        `Integrity ${check.status.toUpperCase()}: ${check.check} (${check.count})`,
        {
          action: `integrity.${check.check}`,
          source: 'integrity',
          metadata: { count: check.count, sample: check.sample },
          skipSentry: check.status === 'pass',
        },
        check.status === 'pass' ? 'info' : 'error',
      );
    }

    return NextResponse.json({
      ok: true,
      failed: checks.filter((c) => c.status === 'fail').map((c) => c.check),
    });
  });
}
