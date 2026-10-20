/**
 * Writer for `golf_coachhelm_run_log` (04 §1.5; 02 §5 "Accounting"): one row
 * per player per engine run with how many candidates were tested, supported,
 * eligible, suppressed by which rule, and how they fell on the ladder.
 *
 * The table comes from migration 20261020114500_golf_coachhelm_run_log.sql,
 * which is HELD (supabase/migrations/HELD.md) until the owner applies it. Main
 * can be deployed before that, so a missing table (Postgres 42P01, PostgREST
 * PGRST205) means "run log not available": the writer returns
 * `'unavailable'` and never throws. Every other failure is logged and
 * swallowed: the run log must never fail an engine run.
 *
 * The table is not in the generated types until `db:types` is regenerated
 * after the apply, so the insert goes through `fromUntyped` (the repo's
 * escape hatch for unapplied tables).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { toDbErrorMetadata } from '@/lib/utils/describe-error';
import type { RunSummary } from './evaluate';

export const RUN_LOG_TABLE = 'golf_coachhelm_run_log';

/**
 * What started the engine run. 'round': a submitted round (round submit, the
 * job queue). 'checkpoint': the safety-net cron re-running a round whose
 * analysis did not finish. 'sweep': the roster sweep. 'manual': a coach
 * refresh or an on-demand analysis. 'unspecified': a caller that named none.
 */
export type RunTrigger = 'round' | 'sweep' | 'manual' | 'checkpoint' | 'unspecified';

export interface RunLogRow {
  player_id: string;
  run_at: string;
  trigger: RunTrigger;
  newest_round_id: string | null;
  candidates: number;
  testable: number;
  supported: number;
  shown: number;
  suppressed: Record<string, number>;
  rungs: Record<string, number>;
  families: Record<string, Partial<Record<string, number>>>;
  watching: RunSummary['watching'];
  tests_in_run: number;
  engine_version: string;
  support_version: string;
}

/** Postgres "relation does not exist" or PostgREST "table not in schema cache". */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === '42P01' || e.code === 'PGRST205') return true;
  return (
    typeof e.message === 'string' &&
    (/relation .* does not exist/i.test(e.message) || /could not find the table/i.test(e.message))
  );
}

export function buildRunLogRow(args: {
  playerId: string;
  runAt: string;
  trigger: RunTrigger;
  newestRoundId: string | null;
  summary: RunSummary;
  engineVersion: string;
  supportVersion: string;
}): RunLogRow {
  const { summary } = args;
  return {
    player_id: args.playerId,
    run_at: args.runAt,
    trigger: args.trigger,
    newest_round_id: args.newestRoundId,
    candidates: summary.candidates,
    testable: summary.testable,
    supported: summary.supported,
    // "shown" at engine time = eligible for a surface (Working hypothesis or
    // above); delivery caps (3 + 1) come after and are not the engine's count.
    shown: summary.eligible,
    suppressed: summary.suppressed,
    rungs: summary.rungs,
    families: summary.families,
    watching: summary.watching.slice(0, 50),
    tests_in_run: summary.tests_in_run,
    engine_version: args.engineVersion,
    support_version: args.supportVersion,
  };
}

export type RunLogWriteResult = 'written' | 'unavailable' | 'failed';

export async function writeRunLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  row: RunLogRow,
): Promise<RunLogWriteResult> {
  try {
    const { error } = await fromUntyped(supabase, RUN_LOG_TABLE).insert(row);
    if (!error) return 'written';
    if (isMissingTableError(error)) return 'unavailable';
    await logServerError(
      `coachhelm run log insert failed for player=${row.player_id}`,
      { action: 'coachhelm.support.runLog', featureArea: 'coachhelm', metadata: { dbError: toDbErrorMetadata(error) } },
      'warning',
    );
    return 'failed';
  } catch (err) {
    if (isMissingTableError(err)) return 'unavailable';
    await logServerError(
      `coachhelm run log insert threw for player=${row.player_id}`,
      { action: 'coachhelm.support.runLog', featureArea: 'coachhelm', metadata: { dbError: toDbErrorMetadata(err) } },
      'warning',
    );
    return 'failed';
  }
}
