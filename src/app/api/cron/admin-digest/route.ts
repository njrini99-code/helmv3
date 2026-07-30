import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { recordJobRun } from '@/lib/admin/job-log';
import { fetchSentryIssues } from '@/lib/admin/sentry-api';
import { fetchTriageQueue, groupAppErrorEvents, type AppTriageEventRow } from '@/lib/admin/data/triage';
import { buildDigestEmail, type DigestData } from '@/lib/admin/digest/build-digest';
import { sendOpsDigest } from '@/lib/admin/digest/transport';
import { CRON_REGISTRY, classifyCronStatus } from '@/lib/admin/cron-registry';
import { fetchDeployFreshness } from '@/lib/admin/deploy-freshness';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * "What shipped yesterday" for Cup of Helm.
 *
 * FAIL-SOFT, and the distinction matters: this returns `undefined` when we
 * could not ask GitHub (no token, network error, non-200) and `[]` only when
 * GitHub answered and nothing had merged. The email renders those two states
 * with different words — "unknown" vs "nothing merged" — because telling the
 * owner nothing shipped when we simply failed to look is the same class of lie
 * as a zeroed dashboard on a failed query.
 *
 * Unauthenticated GitHub search is rate-limited to ~10 req/min per IP, which is
 * fine for one daily call, so a missing token degrades rather than breaks.
 */
async function fetchShippedYesterday(): Promise<Array<{ title: string; number: number }> | undefined> {
  const since = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const url =
    `https://api.github.com/search/issues?q=repo:njrini99-code/helmv3+is:pr+is:merged+merged:%3E=${since}` +
    `&sort=updated&order=desc&per_page=20`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      // Never let a slow GitHub hold the whole cron open.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { items?: Array<{ title?: unknown; number?: unknown }> };
    if (!Array.isArray(json.items)) return undefined;
    return json.items
      .filter((i) => typeof i.title === 'string' && typeof i.number === 'number')
      .map((i) => ({ title: i.title as string, number: i.number as number }));
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  return recordJobRun('admin-digest', async () => {
    const admin = createAdminClient();
    const ago24h = new Date(Date.now() - 86400_000).toISOString();
    const now = new Date();
    const in24h = new Date(Date.now() + 86400_000).toISOString();

    const [
      errors24h,
      signups,
      golf,
      baseball,
      lifts,
      integrityFails,
      jobRows,
      regressed,
      triage,
      demoNew,
      demoPending,
      coachReplies,
      demoWaiting,
      tasksDue,
    ] = await Promise.all([
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
        // "Awaiting reply" must match the CRM's own definition of a new lead —
        // demo-request-status.ts's isNewRequest() is `!status || status ===
        // 'pending'`. An .eq('status','pending') here silently dropped every
        // row inserted with a NULL status, i.e. the newest leads, which is the
        // exact set the digest exists to surface.
        admin
          .from('demo_requests')
          .select('id', { count: 'exact', head: true })
          .or('status.is.null,status.eq.pending'),
        // Inbound coach email. crm_replies is populated by the
        // ingest-gmail-replies cron every 30 minutes, so this is "what coaches
        // sent" without this route needing Gmail credentials of its own. The
        // count is every unread reply; the rows are the five most recent.
        admin
          .from('crm_replies')
          .select('from_address, subject, received_at', { count: 'exact' })
          .eq('is_read', false)
          .order('received_at', { ascending: false })
          .limit(5),
        // The specific leads still waiting, oldest first — same predicate as
        // the count above so the list can never contradict the number.
        admin
          .from('demo_requests')
          .select('name, organization, email, created_at')
          .or('status.is.null,status.eq.pending')
          .order('created_at', { ascending: true })
          .limit(5),
        // CRM follow-ups due inside the next 24h, plus anything already past
        // due. Undated tasks are excluded: without a due date there is nothing
        // to say it belongs in *this* morning's briefing.
        admin
          .from('crm_tasks')
          .select('title, due_at')
          .in('status', ['pending', 'in_progress'])
          .not('due_at', 'is', null)
          .lte('due_at', in24h)
          .order('due_at', { ascending: true })
          .limit(5),
      ]);

    // Outside the Promise.all above so a GitHub hiccup cannot reject the batch.
    const shippedYesterday = await fetchShippedYesterday();

    // How far production is from `main`. Kept outside the batch for the same
    // reason as the GitHub read above, and fail-soft to an `unknown` state.
    const deploy = await fetchDeployFreshness(now);

    const latestByJob = new Map<string, { started_at: string; status: string }>();
    for (const row of (jobRows.data ?? []) as Array<{ job_type: string; status: string; started_at: string }>) {
      if (!latestByJob.has(row.job_type)) latestByJob.set(row.job_type, row);
    }
    const demoPendingCount = demoPending.count ?? 0;

    /**
     * Inbound coach mail. `null` on a failed read, never `{unread: 0}` — a
     * zero here would tell the owner no coach wrote in, which is a claim we
     * cannot make when the query itself failed.
     */
    const coachMail: DigestData['coachMail'] = coachReplies.error
      ? null
      : {
          unread: coachReplies.count ?? 0,
          recent: (
            (coachReplies.data ?? []) as Array<{
              from_address: string | null;
              subject: string | null;
              received_at: string | null;
            }>
          ).map((r) => ({
            from: r.from_address ?? 'unknown sender',
            subject: r.subject ?? '(no subject)',
            ageHours: r.received_at
              ? Math.max(0, (now.getTime() - new Date(r.received_at).getTime()) / 3_600_000)
              : 0,
          })),
        };

    const waiting = (
      (demoWaiting.data ?? []) as Array<{
        name: string | null;
        organization: string | null;
        email: string | null;
        created_at: string | null;
      }>
    ).map((r) => ({
      name: r.name,
      organization: r.organization,
      email: r.email ?? 'unknown',
      waitingDays: r.created_at
        ? Math.max(0, Math.round((now.getTime() - new Date(r.created_at).getTime()) / 86400_000))
        : 0,
    }));

    const openTasks = ((tasksDue.data ?? []) as Array<{ title: string | null; due_at: string | null }>).map((r) => {
      const due = r.due_at ? new Date(r.due_at) : null;
      return {
        title: r.title ?? 'Untitled task',
        dueLabel: due ? due.toISOString().slice(0, 10) : 'no date',
        overdue: due ? due.getTime() < now.getTime() : false,
      };
    });

    const reds: string[] = [
      // First, deliberately: if production is not running `main`, every error
      // below may already be fixed. That reframing has to come before the list
      // it reframes — on 2026-07-30 three of four open "production bug" issues
      // were already-repaired code sitting in an undeployed `main`.
      ...(deploy.red ? [deploy.red] : []),
      // A lead awaiting reply is the most actionable item in the whole digest —
      // it stays red until someone moves it out of 'pending' in the CRM.
      ...(demoPendingCount > 0
        ? [`${demoPendingCount} demo request${demoPendingCount === 1 ? '' : 's'} awaiting reply`]
        : []),
      // A coach who wrote in and got no answer is a person waiting on a person.
      ...(coachMail && coachMail.unread > 0
        ? [`${coachMail.unread} unread coach repl${coachMail.unread === 1 ? 'y' : 'ies'} in the CRM inbox`]
        : []),
      ...(() => {
        const overdue = openTasks.filter((t) => t.overdue).length;
        return overdue > 0 ? [`${overdue} CRM follow-up${overdue === 1 ? '' : 's'} past due`] : [];
      })(),
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
      demoRequests: { new24h: demoNew.count ?? 0, pendingTotal: demoPendingCount, waiting },
      coachMail,
      openTasks,
      activity24h: {
        golfRounds: golf.count ?? 0,
        baseballGames: baseball.count ?? 0,
        liftSessions: lifts.count ?? 0,
      },
      reds,
      shippedYesterday,
      deploy: { state: deploy.state, summary: deploy.summary },
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
