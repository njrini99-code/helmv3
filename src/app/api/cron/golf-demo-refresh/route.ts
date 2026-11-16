/**
 * Daily demo team refresh — GET /api/cron/golf-demo-refresh (launch readiness
 * DD-01).
 *
 * Regenerates the demo team (DEMO_TEAM_ID, nothing else) for today in the
 * team's zone and writes the difference through the generator's database
 * functions (migration 20261115211000): new and changed rows, rows it wrote
 * before that the team no longer has, then the totals, stats and strokes
 * gained of the rounds that changed. A row the generator did not write is
 * never touched. Then it reads the team back and runs the coverage check
 * (`src/lib/golf/demo/coverage.ts`); a failing check fails the run, so the
 * jobs board shows it.
 *
 * Off (`golf_demo_refresh_v1`, off everywhere until the owner turns it on):
 * returns before it reads or writes anything. Without the migration: returns
 * `skipped: migration_not_applied` after one read-only call.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: `35 9 * * *` (vercel.json): 04:35 or 05:35 on the US East coast,
 * before a prospect's morning, after midnight in every US zone.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/admin/job-log';
import { requireCronAuth } from '@/lib/cron/auth';
import { logServerEvent } from '@/lib/server-error-logger';
import { isDemoRefreshEnabled } from '@/lib/golf/demo/flag';
import { refreshDemoTeam } from '@/lib/golf/demo/refresh';
import { DemoPlumbingMissingError } from '@/lib/golf/demo/writer';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('golf-demo-refresh', async () => {
    // Off: nothing is read and nothing is written.
    if (!isDemoRefreshEnabled()) return NextResponse.json({ ok: true, skipped: 'flag_off' });

    const lines: string[] = [];
    let report;
    try {
      report = await refreshDemoTeam(createAdminClient(), {
        apply: true,
        demoCoachEmail: process.env.DEMO_COACH_EMAIL ?? null,
        log: (line) => lines.push(line),
      });
    } catch (err) {
      if (err instanceof DemoPlumbingMissingError) {
        return NextResponse.json({ ok: true, skipped: 'migration_not_applied' });
      }
      throw err;
    }

    const tables = report.result?.tables ?? [];
    const summary = {
      today: report.today,
      upserted: tables.reduce((n, t) => n + t.upserted, 0),
      removed: tables.reduce((n, t) => n + t.removed, 0),
      skipped_not_generated: tables.reduce((n, t) => n + t.skipped.length, 0),
      rounds_finished: report.result?.roundsFinished ?? 0,
      check_errors: report.written?.errors ?? 0,
      check_warnings: report.written?.warnings ?? 0,
    };
    const failing = (report.written?.checks ?? []).filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`);

    await logServerEvent(
      `Demo team refreshed for ${report.today}`,
      {
        action: 'cron.golf-demo-refresh',
        source: 'cron',
        metadata: { ...summary, log: lines.slice(0, 40), failing: failing.slice(0, 20) },
        skipSentry: summary.check_errors === 0,
      },
      summary.check_errors === 0 ? 'info' : 'warning',
    );

    if (summary.check_errors > 0) {
      // recordJobRun records a >=400 answer as a failed run with this line.
      return NextResponse.json(
        { ok: false, error: `The demo team fails ${summary.check_errors} coverage checks after the refresh: ${failing.slice(0, 5).join('; ')}`, ...summary },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, ...summary });
  });
}
