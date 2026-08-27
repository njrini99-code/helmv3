import 'server-only';

/**
 * Reliability collector — orchestration and persistence.
 *
 * Runs the three arms, folds their signals into one correlated set, and writes
 * exactly ONE `background_job_logs` row per run.
 *
 * WHY background_job_logs AND NOT A NEW TABLE
 * -------------------------------------------
 * A new table is R3 (owner-applied migration), which would have blocked the
 * whole pipeline behind a production schema change. `background_job_logs`
 * already exists, already has RLS with policies, already carries a `metadata`
 * jsonb column, and is already rendered by the Bridge's jobs board. This repo
 * has established precedent for using it as durable cron state:
 * `ingest-gmail-replies` records "background_job_logs is the store because it
 * is the only cross-invocation" store, and both `coachhelm-validation` and
 * `helm-debug-prune` surface run detail through `metadata`.
 *
 * The alternative — a JSON file committed by CI — was rejected on a hard
 * constraint: production pins to the last released SHA and releases are capped
 * at two per week, so a committed artifact would be up to a week stale in the
 * Bridge. "The tab tracks everything" requires a live read.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/types/database';
import { collectSentry, collectSupabase, collectVercel } from './sources';
import {
  RELIABILITY_SNAPSHOT_JOB_TYPE,
  correlateSignals,
  summarizeSources,
  worstStatus,
} from './normalize';
import type { ReliabilityRun, SourceResult } from './types';

/** Collection window. Matches the 3-hourly cadence with overlap so a skipped
 *  run (Vercel cron scheduling is best-effort) does not leave a blind gap. */
const WINDOW_HOURS = 4;

/**
 * Advisory route → feature mapping.
 *
 * Deliberately a coarse prefix match and NOT presented as authoritative:
 * `memory/registry.yml` is the canonical router per the OS contract, and it is
 * a build-time artifact this runtime path cannot read. A null here means "not
 * attributed", never "no feature".
 */
function resolveFeatureId(route: string | null): string | null {
  if (!route) return null;
  const r = route.toLowerCase();
  if (r.includes('/rounds') || r.includes('round')) return 'golf_round_lifecycle';
  if (r.includes('/qualifier')) return 'qualifiers';
  if (r.includes('/stats') || r.includes('/analytics')) return 'stats_analytics';
  if (r.includes('/coachhelm')) return 'coachhelm_ai';
  if (r.includes('/admin')) return 'admin_platform';
  if (r.includes('/calendar') || r.includes('/events')) return 'calendar_events';
  return null;
}

export interface CollectOutcome {
  run: ReliabilityRun;
  /** The job-log row id, when the write succeeded. */
  jobLogId: string | null;
  /** Set when the run completed but could not be persisted. */
  persistError: string | null;
}

export async function runReliabilityCollection(now: Date = new Date()): Promise<CollectOutcome> {
  const startedAt = now;
  const windowStart = new Date(now.getTime() - WINDOW_HOURS * 3600_000);
  const windowStartIso = windowStart.toISOString();

  // Arms run concurrently and are individually fault-isolated: one arm throwing
  // must not take the run down, because a run that dies produces no record at
  // all — which is indistinguishable from "never scheduled" on the jobs board.
  const settled = await Promise.allSettled([
    collectSentry(),
    collectSupabase(windowStartIso),
    collectVercel(),
  ]);

  const sourceNames = ['sentry', 'supabase', 'vercel'] as const;
  const results: SourceResult[] = settled.map((outcome, i) => {
    if (outcome.status === 'fulfilled') return outcome.value;
    return {
      source: sourceNames[i]!,
      status: 'blind' as const,
      reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      signals: [],
      bounded: false,
      durationMs: 0,
    };
  });

  const { signals, truncatedSignals } = correlateSignals(results, resolveFeatureId);
  const overallStatus = worstStatus(results.map((r) => r.status));

  const run: ReliabilityRun = {
    version: 1,
    windowStart: windowStartIso,
    windowEnd: now.toISOString(),
    overallStatus,
    sources: summarizeSources(results),
    signals,
    truncatedSignals,
  };

  const completedAt = new Date();
  const admin = createAdminClient();

  // The row's `status` reflects the WORST arm, not merely "the function
  // returned". A collector that could not reach Sentry is not a successful
  // collection, and a green board for a two-thirds-blind run is exactly the
  // false-green this system exists to prevent.
  //
  // 'completed' / 'failed' is the table's real vocabulary, verified against
  // production rather than assumed: all 19,832 existing rows use those two and
  // nothing else. An earlier draft wrote 'success', which no other writer emits
  // and every status-based filter would have missed.
  const jobStatus = overallStatus === 'blind' ? 'failed' : 'completed';
  const blindArms = results.filter((r) => r.status === 'blind').map((r) => r.source);

  const { data, error } = await admin
    .from('background_job_logs')
    .insert({
      job_type: RELIABILITY_SNAPSHOT_JOB_TYPE,
      status: jobStatus,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
      error_message: blindArms.length > 0 ? `blind sources: ${blindArms.join(', ')}` : null,
      // `ReliabilityRun` is a closed, JSON-only shape (strings, numbers, arrays
      // of the same) so the cast to the generated `Json` type is safe rather
      // than merely convenient — there is no Date, Map or undefined in it.
      metadata: run as unknown as Json,
    })
    .select('id')
    .single();

  return {
    run,
    jobLogId: data?.id ?? null,
    persistError: error?.message ?? null,
  };
}
