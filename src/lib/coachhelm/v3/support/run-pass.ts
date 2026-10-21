/**
 * The per-run support pass, server half (Slice 1, flag `coachhelm_support_v1`,
 * off). Runs after the Tier-1 generators and the composite synthesis have
 * written a player's rows for this run:
 *
 *   1. read the v3 rows this run wrote: exactly the ids `upsertInsightV3`
 *      recorded inside the orchestrator's run collector (./run-collector.ts),
 *      never a time window, so overlapping runs and this pass's own writes do
 *      not leak into another run's BH population;
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
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { describeError, toDbErrorMetadata } from '@/lib/utils/describe-error';
import { isCountableRound } from '@/lib/golf/round-countable';
import type { Database, Json } from '@/lib/types/database';
import { evaluatePlayerRun, SUPPORT_VERSION, type RunSummary, type SupportRow } from './evaluate';
import { isSupportPassEnabled } from './flag';
import { teamPoolEnabled } from '@/lib/coachhelm/v3/team-pool/flag';
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
  /** The insight ids this run's generators and composites upserted
   *  (`createRunInsightCollector().ids()`). BH runs over exactly these. */
  insightIds: readonly string[];
  /** Rows the philosophy gate held back this run (`collector.gated()`): in BH's m, never written. */
  gated?: readonly SupportRow[];
  /** Writes `upsertInsight` refused this run (`collector.refused()`): in BH's m at p = 1. */
  refused?: number;
  trigger?: RunTrigger;
  /** Test seams. */
  supabase?: SupabaseClient<Database>;
  enabled?: boolean;
}

/** Rounds scanned for the newest countable one; a run of more than this many
 *  newest non-countable rounds in a row records null. */
const NEWEST_ROUND_SCAN = 20;
/** PostgREST `.in()` chunk: keeps the request URL well under its limit. */
const ID_CHUNK = 100;
/** Evidence updates in flight at once. Each is a compare-and-set on its own
 *  row's `updated_at`, so they cannot be folded into one upsert without
 *  losing that guard; a bounded fan-out keeps the guard and the pool small. */
const UPDATE_CONCURRENCY = 8;

async function newestCountableRoundId(supabase: SupabaseClient<Database>, playerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('golf_rounds')
    .select('id, status, is_test, holes_played, total_score, front_nine, back_nine, total_putts')
    .eq('player_id', playerId)
    .eq('is_test', false)
    .eq('status', 'completed')
    .order('round_date', { ascending: false })
    .limit(NEWEST_ROUND_SCAN);
  if (error) {
    await logServerEvent(
      `coachhelm support pass newest-round query failed for player=${playerId}`,
      { action: 'coachhelm.support.newestRound', featureArea: 'coachhelm', playerId, metadata: { dbError: toDbErrorMetadata(error) } },
      'warning',
    );
    return null;
  }
  if (!data) return null;
  // The one countable-round rule (src/lib/golf/round-countable.ts): complete,
  // non-test, a supported length, fully recorded and plausible.
  return data.find((r) => isCountableRound(r))?.id ?? null;
}

type InsightRow = { id: string; insight_type: string | null; evidence: Json | null; updated_at: string | null };

async function loadRunRows(
  supabase: SupabaseClient<Database>,
  playerId: string,
  insightIds: readonly string[],
): Promise<{ rows: InsightRow[]; error: unknown }> {
  const unique = [...new Set(insightIds)];
  const rows: InsightRow[] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from('golf_coach_insights')
      .select('id, insight_type, evidence, updated_at')
      .in('id', unique.slice(i, i + ID_CHUNK))
      .eq('player_id', playerId)
      .eq('engine_version', 'v3')
      .is('archived_at', null)
      .neq('lifecycle_state', 'archived');
    if (error) return { rows: [], error };
    rows.push(...((data ?? []) as InsightRow[]));
  }
  return { rows, error: null };
}

export async function runSupportPass(opts: SupportPassOptions): Promise<SupportPassResult | null> {
  const enabled = opts.enabled ?? isSupportPassEnabled();
  if (!enabled) return null;
  const { playerId, insightIds } = opts;
  try {
    const supabase = opts.supabase ?? createAdminClient();
    const { rows, error } = await loadRunRows(supabase, playerId, insightIds);
    if (error) {
      await logServerError(
        `coachhelm support pass select failed for player=${playerId}`,
        { action: 'coachhelm.support.pass', featureArea: 'coachhelm', playerId, metadata: { dbError: toDbErrorMetadata(error) } },
        'warning',
      );
      return null;
    }
    const list = rows;
    // The run-log row's id is minted here so every row this pass writes can
    // carry it (`support.run_id`) next to `support.run_at` (finding 9).
    const runAt = new Date().toISOString();
    const runId = randomUUID();
    // Slice 7a: test and shrink against a row's team pool line when the flag is on.
    const evaluation = evaluatePlayerRun(list, {
      gated: opts.gated,
      refused: opts.refused,
      runAt,
      runId,
      teamPool: teamPoolEnabled(),
    });

    let rowsUpdated = 0;
    let rowsSkipped = 0;
    const byId = new Map(list.map((r) => [r.id, r]));
    const writeOne = async (evaluated: (typeof evaluation.rows)[number]): Promise<void> => {
      const row = byId.get(evaluated.id);
      if (!row) return;
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
        return;
      }
      // Zero rows: a newer write landed between the read and this update; its
      // own run's pass will stamp it.
      if (!updated || updated.length === 0) rowsSkipped += 1;
      else rowsUpdated += 1;
    };
    for (let i = 0; i < evaluation.rows.length; i += UPDATE_CONCURRENCY) {
      await Promise.all(evaluation.rows.slice(i, i + UPDATE_CONCURRENCY).map(writeOne));
    }

    const newestRoundId = await newestCountableRoundId(supabase, playerId);
    const runLog = await writeRunLog(
      supabase,
      buildRunLogRow({
        id: runId,
        playerId,
        runAt,
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
