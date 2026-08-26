import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { runReliabilityCollection } from '@/lib/reliability/collect';

/**
 * Reliability triage collector — every 3 hours.
 *
 * Reads Sentry, Supabase and Vercel, correlates what they report into one
 * deduped signal set, and writes a single `background_job_logs` row that the
 * Helm Bridge's Reliability tab renders live.
 *
 * PHASE 1 IS READ-AND-RECORD ONLY. It opens no issues, files no PRs and merges
 * nothing. That boundary is deliberate: the correlation is keyed on a signature
 * whose real-world distribution across three sources has never been observed,
 * and wiring an auto-fix loop to an unvalidated dedupe rule is how a system
 * opens noise PRs against production code every three hours. The distribution
 * this job records is the evidence the next phase gets designed from.
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

  try {
    const outcome = await runReliabilityCollection();

    // A failed PERSIST is reported as a failure even though collection worked —
    // an unrecorded run is invisible to the Bridge, which is the only consumer.
    if (outcome.persistError) {
      return NextResponse.json(
        {
          ok: false,
          error: `collection succeeded but persist failed: ${outcome.persistError}`,
          overallStatus: outcome.run.overallStatus,
          signalCount: outcome.run.signals.length,
        },
        { status: 500 },
      );
    }

    // 200 with `ok: false` when an arm was blind: the HTTP call did complete,
    // but the run is not a clean one and the payload must not read like it is.
    const blind = outcome.run.sources.filter((s) => s.status === 'blind');
    return NextResponse.json({
      ok: blind.length === 0,
      jobLogId: outcome.jobLogId,
      overallStatus: outcome.run.overallStatus,
      signalCount: outcome.run.signals.length,
      truncatedSignals: outcome.run.truncatedSignals,
      blindSources: blind.map((s) => ({ source: s.source, reason: s.reason })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
