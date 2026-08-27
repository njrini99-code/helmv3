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

      // 503 when any arm was blind, so the Jobs board shows this cron as FAILED
      // rather than green. `recordJobRun` treats >=400 as a failed run, which is
      // the behaviour we want: a collector that can read one of three sources
      // has not done its job, and the board is where an operator would look.
      //
      // This will hold the board red until SENTRY_READ_TOKEN and a Vercel token
      // exist — which is correct, not noisy. The error line names exactly which
      // sources are blind, so the board states the remedy.
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

      return blind.length > 0
        ? NextResponse.json(
            { ...body, error: `blind sources: ${body.blindSources}` },
            { status: 503 },
          )
        : NextResponse.json(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  });
}
