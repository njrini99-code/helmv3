import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { recordJobRun } from '@/lib/admin/job-log';
import { fetchSentryIssues } from '@/lib/admin/sentry-api';
import { fetchTriageQueue, groupAppErrorEvents, type AppTriageEventRow } from '@/lib/admin/data/triage';
import { buildDigestEmail, type DigestData } from '@/lib/admin/digest/build-digest';
import { sendOpsDigest } from '@/lib/admin/digest/transport';
import { CRON_REGISTRY, classifyCronStatus } from '@/lib/admin/cron-registry';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  return recordJobRun('admin-digest', async () => {
    const admin = createAdminClient();
    const ago24h = new Date(Date.now() - 86400_000).toISOString();
    const now = new Date();

    const [errors24h, signups, golf, baseball, lifts, integrityFails, jobRows, regressed, triage, demoNew, demoPending] =
      await Promise.all([
        admin
          .from('admin_events')
          .select(
            'id, title, message, severity, sport, fingerprint, user_id, user_email, url, created_at, source, feature, stack_trace, metadata',
          )
          .eq('event_type', 'error')
          .eq('resolved', false)
          .gte('created_at', ago24h)
          .neq('severity', 'info')
          .order('created_at', { ascending: false })
          .limit(500),
        admin.from('users').select('email, role').gte('created_at', ago24h).limit(50),
        admin.from('golf_rounds').select('id', { count: 'exact', head: true }).gte('created_at', ago24h),
        admin.from('baseball_games').select('id', { count: 'exact', head: true }).gte('created_at', ago24h),
        admin.from('helm_lifting_sessions').select('id', { count: 'exact', head: true }).gte('created_at', ago24h),
        admin.from('admin_events').select('title')
          .eq('source', 'integrity').eq('severity', 'error').gte('created_at', ago24h).limit(10),
        admin.from('background_job_logs').select('job_type, status, started_at')
          .order('started_at', { ascending: false }).limit(300),
        fetchSentryIssues({ query: 'is:regressed', limit: 25 }),
        fetchTriageQueue(),
        admin.from('demo_requests').select('id', { count: 'exact', head: true }).gte('created_at', ago24h),
        admin.from('demo_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

    const latestByJob = new Map<string, { started_at: string; status: string }>();
    for (const row of (jobRows.data ?? []) as Array<{ job_type: string; status: string; started_at: string }>) {
      if (!latestByJob.has(row.job_type)) latestByJob.set(row.job_type, row);
    }
    const demoPendingCount = demoPending.count ?? 0;
    const reds: string[] = [
      // A lead awaiting reply is the most actionable item in the whole digest —
      // it stays red until someone moves it out of 'pending' in the CRM.
      ...(demoPendingCount > 0
        ? [`${demoPendingCount} demo request${demoPendingCount === 1 ? '' : 's'} awaiting reply`]
        : []),
      ...((integrityFails.data ?? []) as Array<{ title: string }>).map((r) => r.title),
      ...CRON_REGISTRY
        .filter((e) => e.jobType !== 'admin-digest')
        .map((e) => ({ e, status: classifyCronStatus(e, latestByJob.get(e.jobType) ?? null, now) }))
        .filter(({ status }) => status === 'overdue' || status === 'failed')
        .map(({ e, status }) => `cron ${status}: ${e.jobType}`),
    ];
    const appErrorGroups24h = groupAppErrorEvents((errors24h.data ?? []) as unknown as AppTriageEventRow[]);

    const data: DigestData = {
      generatedAt: now.toISOString(),
      errors24h: {
        total: appErrorGroups24h.length,
        critical: appErrorGroups24h.filter((i) => i.severity === 'critical').length,
        topIncidents: appErrorGroups24h.slice(0, 5).map((i) => ({
          title: i.title, occurrences: i.occurrences, affectedUsers: i.affectedUsers,
        })),
      },
      sentry: {
        unresolved: triage.sentry.status === 'ok' ? (triage.sentry.data?.length ?? 0) : null,
        regressed: regressed.status === 'ok' ? (regressed.data?.length ?? 0) : null,
      },
      signups24h: ((signups.data ?? []) as Array<{ email: string; role: string }>),
      demoRequests: { new24h: demoNew.count ?? 0, pendingTotal: demoPendingCount },
      activity24h: {
        golfRounds: golf.count ?? 0,
        baseballGames: baseball.count ?? 0,
        liftSessions: lifts.count ?? 0,
      },
      reds,
    };

    const result = await sendOpsDigest(buildDigestEmail(data));
    if (!result.sent && !result.skipped) {
      // A real send failure (not "ops transport unconfigured" — that's
      // skipped=true and expected in dev/preview).
      await logServerError(
        `admin-digest send failed: ${result.reason ?? 'unknown'}`,
        { action: 'cron.admin-digest', source: 'cron' },
        'error',
      );
    }
    return NextResponse.json({ ok: true, ...result, reds: reds.length });
  });
}
