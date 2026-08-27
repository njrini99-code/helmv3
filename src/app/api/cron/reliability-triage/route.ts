import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { runReliabilityCollection } from '@/lib/reliability/collect';
import { RELIABILITY_JOB_TYPE } from '@/lib/reliability/normalize';

/**
 * Reliability triage collector — every 3 hours.
 *
 * Reads Sentry, Supabase and Vercel, correlates what they report into one
 * deduped signal set, and writes the payload the Helm Bridge's Reliability tab
 * renders live.
 *
 * TWO ROWS PER RUN, ON PURPOSE. `recordJobRun` writes the standard cron-board
 * row every registered cron must produce (enforced by
 * `cron-job-log-coverage.test.ts`), capturing the top-level scalars this
 * handler returns. The detailed correlated payload is written separately by
 * `runReliabilityCollection` under its own job type, because `recordJobRun`
 * keeps only top-level scalars and would silently strip `signals[]`.
 *
 * PHASE 1 IS READ-AND-RECORD ONLY. It opens no issues, files no PRs and merges
 * nothing. The correlation is keyed on a signature whose real-world
 * distribution across three sources has never been observed, and wiring an
 * auto-fix loop to an unvalidated dedupe rule is how a system opens noise PRs
 * against production code every three hours. What this job records is the
 * evidence the next phase gets designed from.
 *
 * The hard wall from `memory/system/golfhelm-engineering-os.md` applies
 * regardless of phase: daily reliability never deploys, promotes or rolls back
 * production.
 */

// This job reads three network sources; it must not be prerendered or cached.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  return recordJobRun(RELIABILITY_JOB_TYPE, async () => {
    try {
      const outcome = await runReliabilityCollection();
      const { run } = outcome;
      const blind = run.sources.filter((s) => s.status === 'blind');

      // A failed PERSIST is a failed run even though collection worked: the
      // Bridge is the only consumer, so an unrecorded run is an invisible one.
      if (outcome.persistError) {
        return NextResponse.json(
          {
            ok: false,
            error: `collection succeeded but persist failed: ${outcome.persistError}`,
            overallStatus: run.overallStatus,
            signalCount: run.signals.length,
          },
          { status: 500 },
        );
      }

      // TOTALLY blind fails the run; PARTIALLY blind does not. The distinction
      // is not cosmetic, because `recordJobRun` does more than write a job row
      // on a >=400: it also calls `logServerEvent(..., 'error')`, which writes
      // an `admin_events` row.
      //
      // An earlier draft returned 503 whenever ANY arm was blind. With one
      // unreadable source at a 3-hour cadence that is eight error rows a day,
      // forever, landing in `/admin/errors`, the triage queue, the incident feed
      // and the bottom-nav error badge — a system whose entire thesis is "never
      // hide errors" quietly manufacturing them in the surface an operator uses
      // to find real ones. The self-feed filter keeps them out of this
      // collector's own reads, but not out of everyone else's view.
      //
      // A degraded run is already reported honestly twice over: the snapshot row
      // carries status='failed', and the tab renders a danger band naming each
      // blind source. Losing a permanently-red Jobs board for partial blindness
      // is the right trade for a triage queue that stays about production.
      //
      // Every value below is a top-level scalar because `recordJobRun` keeps
      // only scalars; anything nested here would be silently dropped from the
      // cron-board row.
      const body = {
        ok: blind.length === 0,
        jobLogId: outcome.jobLogId,
        overallStatus: run.overallStatus,
        signalCount: run.signals.length,
        corroboratedCount: run.signals.filter((s) => s.sources.length > 1).length,
        truncatedSignals: run.truncatedSignals,
        blindSources: blind.map((s) => s.source).join(', '),
      };

      const totallyBlind = blind.length === run.sources.length && run.sources.length > 0;

      return totallyBlind
        ? NextResponse.json(
            { ...body, error: `all sources blind: ${body.blindSources}` },
            { status: 503 },
          )
        : NextResponse.json(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  });
}
