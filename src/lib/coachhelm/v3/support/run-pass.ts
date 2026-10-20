/**
 * The per-run support pass, server half (Slice 1, flag `coachhelm_support_v1`,
 * off). Runs after the Tier-1 generators and the composite synthesis have
 * written a player's rows for this run:
 *
 *   1. read the v3 rows this run wrote (updated at or after the run's start);
 *   2. `evaluatePlayerRun`: support per row, BH across all of them, shrinkage,
 *      stability where the evidence carries halves, the ladder;
 *   3. merge the fields into each row's `evidence` (compare-and-set on
 *      `updated_at`, so a concurrent newer write wins and this pass skips it);
 *   4. write one `golf_coachhelm_run_log` row (missing table = not available).
 *
 * With the flag off this module is never entered: nothing is read, nothing is
 * written. With it on, the only row change is additive evidence keys
 * (`support`, `ladder`, `what_ladder`, `ladder_reasons`, `strokes_shrunk`,
 * `shrink`, `stability`); `confidence`, `title`, `content`, `priority` and the
 * lifecycle are untouched, so "Solid / Early / Thin" read exactly as before
 * until a renderer reads `ladder` (a later PR).
 *
 * Failure-isolated: every error is logged and swallowed; the engine run that
 * called it is never failed by it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError, toDbErrorMetadata } from '@/lib/utils/describe-error';
import type { Database, Json } from '@/lib/types/database';
import { evaluatePlayerRun, SUPPORT_VERSION, type RunSummary } from './evaluate';
import { isSupportPassEnabled } from './flag';
import { buildRunLogRow, writeRunLog, type RunLogWriteResult, type RunTrigger } from './run-log';

export { isSupportPassEnabled, SUPPORT_FLAG } from './flag';

export interface SupportPassResult {
  summary: RunSummary;
  rowsUpdated: number;
  rowsSkipped: number;
  runLog: RunLogWriteResult;
}

export interface SupportPassOptions {
  playerId: string;
  /** ISO time captured before the generators started. */
  runStartedAt: string;
  trigger?: RunTrigger;
  /** Test seams. */
  supabase?: SupabaseClient<Database>;
  enabled?: boolean;
}

async function newestCountableRoundId(supabase: SupabaseClient<Database>, playerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('golf_rounds')
    .select('id')
    .eq('player_id', playerId)
    .eq('is_test', false)
    .eq('status', 'completed')
    .order('round_date', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0]!.id;
}

export async function runSupportPass(opts: SupportPassOptions): Promise<SupportPassResult | null> {
  const enabled = opts.enabled ?? isSupportPassEnabled();
  if (!enabled) return null;
  const { playerId, runStartedAt } = opts;
  try {
    const supabase = opts.supabase ?? createAdminClient();
    const { data: rows, error } = await supabase
      .from('golf_coach_insights')
      .select('id, insight_type, evidence, updated_at')
      .eq('player_id', playerId)
      .eq('engine_version', 'v3')
      .is('archived_at', null)
      .neq('lifecycle_state', 'archived')
      .gte('updated_at', runStartedAt);
    if (error) {
      await logServerError(
        `coachhelm support pass select failed for player=${playerId}`,
        { action: 'coachhelm.support.pass', featureArea: 'coachhelm', playerId, metadata: { dbError: toDbErrorMetadata(error) } },
        'warning',
      );
      return null;
    }
    const list = rows ?? [];
    const evaluation = evaluatePlayerRun(list);

    let rowsUpdated = 0;
    let rowsSkipped = 0;
    const byId = new Map(list.map((r) => [r.id, r]));
    for (const evaluated of evaluation.rows) {
      const row = byId.get(evaluated.id);
      if (!row) continue;
      const base =
        row.evidence && typeof row.evidence === 'object' && !Array.isArray(row.evidence)
          ? (row.evidence as Record<string, unknown>)
          : {};
      const evidence = { ...base, ...evaluated.patch } as unknown as Json;
      let update = supabase.from('golf_coach_insights').update({ evidence }).eq('id', row.id);
      update = row.updated_at === null ? update.is('updated_at', null) : update.eq('updated_at', row.updated_at);
      const { data: updated, error: updateError } = await update.select('id');
      if (updateError) {
        rowsSkipped += 1;
        await logServerError(
          `coachhelm support pass update failed for insight=${row.id}`,
          { action: 'coachhelm.support.pass', featureArea: 'coachhelm', playerId, metadata: { dbError: toDbErrorMetadata(updateError) } },
          'warning',
        );
        continue;
      }
      // Zero rows: a newer write landed between the read and this update; its
      // own run's pass will stamp it.
      if (!updated || updated.length === 0) rowsSkipped += 1;
      else rowsUpdated += 1;
    }

    const newestRoundId = await newestCountableRoundId(supabase, playerId);
    const runLog = await writeRunLog(
      supabase,
      buildRunLogRow({
        playerId,
        runAt: new Date().toISOString(),
        trigger: opts.trigger ?? 'unspecified',
        newestRoundId,
        summary: evaluation.summary,
        engineVersion: 'v3',
        supportVersion: SUPPORT_VERSION,
      }),
    );
    return { summary: evaluation.summary, rowsUpdated, rowsSkipped, runLog };
  } catch (err) {
    await logServerError(
      `coachhelm support pass threw for player=${playerId}: ${describeError(err)}`,
      { action: 'coachhelm.support.pass', featureArea: 'coachhelm', playerId, metadata: { dbError: toDbErrorMetadata(err) } },
      'warning',
    );
    return null;
  }
}
