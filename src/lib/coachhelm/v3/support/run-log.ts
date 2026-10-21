/**
 * Writer for `golf_coachhelm_run_log` (04 §1.5; 02 §5 "Accounting"): one row
 * per player per engine run with how many candidates were tested, supported,
 * eligible, suppressed by which rule, and how they fell on the ladder.
 *
 * The table comes from migration 20261020114500_golf_coachhelm_run_log.sql,
 * now applied and in the generated types, so the insert uses the typed
 * client. The writer still treats a missing table (Postgres 42P01, PostgREST
 * PGRST205) as "run log not available": it returns `'unavailable'` and never
 * throws. Every other failure is logged and swallowed: the run log must never
 * fail an engine run.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { logServerError } from '@/lib/server-error-logger';
import { toDbErrorMetadata } from '@/lib/utils/describe-error';
import type { RunSummary } from './evaluate';

export const RUN_LOG_TABLE = 'golf_coachhelm_run_log';

/**
 * What started the engine run. 'round': a submitted round (round submit, the
 * job queue). 'safety_net': the safety-net cron re-running a round whose
 * analysis did not finish. 'checkpoint': a scheduled 02 §5 checkpoint
 * re-test (reserved; no caller yet). 'sweep': the roster sweep. 'manual': a
 * coach refresh or an on-demand analysis. 'unspecified': a caller that named
 * none.
 */
export type RunTrigger = 'round' | 'sweep' | 'manual' | 'safety_net' | 'checkpoint' | 'unspecified';

export interface RunLogRow {
  id?: string;
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
  /** How `tests_in_run` splits: rows written, rows the gate held back, rows refused. */
  m_recorded: number;
  m_gated: number;
  m_refused: number;
  engine_version: string;
  support_version: string;
}

/**
 * Postgres "relation does not exist" (42P01) or PostgREST "table not in
 * schema cache" (PGRST205), by code only: a message match would also catch
 * 42703 "column ... does not exist", a real failure that must be logged.
 */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === '42P01' || code === 'PGRST205';
}

export function buildRunLogRow(args: {
  id?: string;
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
    ...(args.id ? { id: args.id } : {}),
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
    m_recorded: summary.m_recorded,
    m_gated: summary.m_gated,
    m_refused: summary.m_refused,
    engine_version: args.engineVersion,
    support_version: args.supportVersion,
  };
}

export type RunLogWriteResult = 'written' | 'unavailable' | 'failed';

export async function writeRunLog(
  supabase: SupabaseClient<Database>,
  row: RunLogRow,
): Promise<RunLogWriteResult> {
  try {
    const { error } = await supabase.from(RUN_LOG_TABLE).insert(row);
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
