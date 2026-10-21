/**
 * Nightly lifecycle step (CoachHelm Slice 3; 07 §2 D and G step 4):
 * checkpoints → recheck → Contradicted pairing → Under review → round-based
 * archive. Called once from the insight-lifecycle cron
 * (`src/app/api/cron/coachhelm-insight-lifecycle/route.ts`), after the age
 * scan and before the rollups and Slice 4's verdict step (PR #2227), so the
 * verdicts see tonight's state.
 *
 * Behind `coachhelm_recheck_v1` (off): with the flag off it returns before a
 * single query. `golf_coachhelm_player_state` (and Slice 6a's
 * `golf_coachhelm_corrections`) are held migrations: a missing table
 * (42P01 / PGRST205) means "not available", never a throw.
 *
 * All decisions are in the pure `plan.ts` / `checkpoint.ts`; this file only
 * loads and writes. Writes are compare-and-set on the row's observed
 * `lifecycle_state` and `updated_at`, like every other engine writer; a lost
 * race is counted and left for the next night. The coach's `status` is never
 * written.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';
import {
  PAR_BY_METRIC,
  PUTT_BAND_BY_METRIC,
  isWeaknessTarget,
  parScoringRecheck,
  puttBandRecheck,
  recheckOnBestWindow,
  recheckWindows,
  type RecentHole,
  type RecentPutt,
  type RecheckRecord,
} from '@/lib/coachhelm/v3/engine/recent-recheck';
import { isRecheckEnabled } from './flag';
import { isMissingSchemaError } from './schema-missing';
import {
  anyCheckpoint,
  checkpointCovers,
  familyForMetric,
  evaluateCheckpoint,
  parseAttempts,
  type CheckpointShot,
  type PlayerCheckpointState,
} from './checkpoint';
import { countDriverPenaltyLink, type LinkShot } from './contradiction';
import { holeSumMismatchRoundIds } from './under-review';
import { planPlayer, type PlayerPlanCounts, type ReadPatch } from './plan';
import { CONTRADICTION_RESOLVED_BY, LIVE_STATES, type CorrectionRow, type LifecycleReadRow } from './types';
import { RECHECK_RESOLVED_BY } from '@/lib/coachhelm/v3/engine/recent-recheck';

type Client = SupabaseClient<Database>;

export const STATE_TABLE = 'golf_coachhelm_player_state';
export const CORRECTIONS_TABLE = 'golf_coachhelm_corrections';
/** Newest rounds loaded per player (covers 15 rounds and 90 days for anyone logging < 1 a day). */
const ROUNDS_LIMIT = 120;
const MAX_PLAYERS_PER_RUN = 400;
const DEFAULT_TIME_BUDGET_MS = 120_000;
const IN_CHUNK = 100;

const READ_COLUMNS =
  'id, player_id, insight_type, signature, title, lifecycle_state, dismissed, evidence, metadata, created_at, updated_at';

export interface LifecycleRunResult {
  enabled: boolean;
  /** False when the state table is not in the database yet. */
  available: boolean;
  players: number;
  checkpoints: { player: number; family: number; baseline: number; none: number };
  patches: number;
  lost_cas: number;
  failed: number;
  truncated: boolean;
  corrections_available: boolean;
  totals: Omit<PlayerPlanCounts, 'archived'> & { archived: Record<string, number> };
}

function emptyResult(enabled: boolean, available: boolean): LifecycleRunResult {
  return {
    enabled,
    available,
    players: 0,
    checkpoints: { player: 0, family: 0, baseline: 0, none: 0 },
    patches: 0,
    lost_cas: 0,
    failed: 0,
    truncated: false,
    corrections_available: false,
    totals: { covered: 0, rechecked: 0, cleared: 0, holds: 0, conflicts: 0, under_review: 0, restored: 0, archived: {} },
  };
}

function chunks<T>(xs: readonly T[], n = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

interface StateRow {
  player_id: string;
  last_checkpoint_round_id: string | null;
  last_checkpoint_at: string | null;
  checkpoint_count: number | null;
  rounds_since: number | null;
  attempts_since: unknown;
  updated_at: string | null;
}

interface RoundRow extends CountableRoundInput {
  id: string;
  round_date: string | null;
  created_at: string | null;
}

interface ShotRow extends CheckpointShot, LinkShot {}

export async function runCheckpointLifecycle(
  supabase: Client,
  opts: { now?: Date; timeBudgetMs?: number; maxPlayers?: number } = {},
): Promise<LifecycleRunResult> {
  if (!isRecheckEnabled()) return emptyResult(false, false);

  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const started = Date.now();
  const budget = opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;

  // Probe: the table may not be applied yet.
  const probe = await supabase.from(STATE_TABLE).select('player_id').limit(1);
  if (probe.error) {
    if (isMissingSchemaError(probe.error)) return emptyResult(true, false);
    throw new Error(`lifecycle state probe failed: ${probe.error.message}`);
  }

  const result = emptyResult(true, true);
  const reads = await loadReads(supabase);
  const byPlayer = new Map<string, LifecycleReadRow[]>();
  for (const r of reads) {
    if (!r.player_id) continue;
    const list = byPlayer.get(r.player_id) ?? [];
    list.push(r);
    byPlayer.set(r.player_id, list);
  }
  const playerIds = [...byPlayer.keys()];
  const states = await loadStates(supabase, playerIds);
  // Least recently processed first, so a truncated run rotates fairly.
  playerIds.sort((a, b) => (states.get(a)?.updated_at ?? '').localeCompare(states.get(b)?.updated_at ?? '') || a.localeCompare(b));

  const corrections = await loadCorrections(supabase, reads.map((r) => r.id));
  result.corrections_available = corrections.available;

  const maxPlayers = opts.maxPlayers ?? MAX_PLAYERS_PER_RUN;
  for (const playerId of playerIds) {
    if (result.players >= maxPlayers || Date.now() - started > budget) {
      result.truncated = true;
      break;
    }
    result.players += 1;
    try {
      await processPlayer(supabase, playerId, byPlayer.get(playerId) ?? [], states.get(playerId) ?? null, corrections.rows, now, result);
    } catch (err) {
      result.failed += 1;
      await logServerError(
        `coachhelm.lifecycle.player failed: ${describeError(err)}`,
        { action: 'coachhelm.lifecycle.player', featureArea: 'coachhelm', extra: { playerId } },
        'error',
      );
    }
  }

  await logServerEvent(
    `coachhelm.lifecycle: players=${result.players} patches=${result.patches} cleared=${result.totals.cleared} ` +
      `conflicts=${result.totals.conflicts} archived=${JSON.stringify(result.totals.archived)} failed=${result.failed}`,
    {
      action: 'coachhelm.lifecycle.run',
      featureArea: 'coachhelm',
      extra: { ...result.checkpoints, truncated: result.truncated, lost_cas: result.lost_cas, at: nowIso },
    },
  );
  return result;
}

async function loadReads(supabase: Client): Promise<LifecycleReadRow[]> {
  const live = await fetchAllRowsResult<LifecycleReadRow>((from, to) =>
    fromUntyped(supabase, 'golf_coach_insights')
      .select(READ_COLUMNS)
      .eq('engine_version', 'v3')
      .in('lifecycle_state', LIVE_STATES as string[])
      .order('id', { ascending: true })
      .range(from, to),
  );
  if (live.error) throw new Error(`lifecycle reads query failed: ${live.error.message}`);
  const retired = await fetchAllRowsResult<LifecycleReadRow>((from, to) =>
    fromUntyped(supabase, 'golf_coach_insights')
      .select(READ_COLUMNS)
      .eq('engine_version', 'v3')
      .eq('lifecycle_state', 'archived')
      .in('metadata->>resolved_by', [RECHECK_RESOLVED_BY, CONTRADICTION_RESOLVED_BY])
      .order('id', { ascending: true })
      .range(from, to),
  );
  if (retired.error) throw new Error(`lifecycle retired reads query failed: ${retired.error.message}`);
  return [...(live.data ?? []), ...(retired.data ?? [])];
}

async function loadStates(supabase: Client, playerIds: readonly string[]): Promise<Map<string, StateRow>> {
  const out = new Map<string, StateRow>();
  for (const ids of chunks(playerIds)) {
    const { data, error } = await supabase
      .from(STATE_TABLE)
      .select('player_id, last_checkpoint_round_id, last_checkpoint_at, checkpoint_count, rounds_since, attempts_since, updated_at')
      .in('player_id', ids);
    if (error) throw new Error(`lifecycle state query failed: ${error.message}`);
    for (const row of data ?? []) out.set(row.player_id, row);
  }
  return out;
}

async function loadCorrections(
  supabase: Client,
  insightIds: readonly string[],
): Promise<{ available: boolean; rows: CorrectionRow[] }> {
  const rows: CorrectionRow[] = [];
  for (const ids of chunks(insightIds)) {
    const { data, error } = (await fromUntyped(supabase, CORRECTIONS_TABLE)
      .select('id, insight_id, kind, reason, alternative_cause_label, created_at')
      .in('insight_id', ids)) as { data: CorrectionRow[] | null; error: { message: string; code?: string | null } | null };
    if (error) {
      // Slice 6a's table is held: missing means "no corrections".
      if (isMissingSchemaError(error)) return { available: false, rows: [] };
      throw new Error(`lifecycle corrections query failed: ${error.message}`);
    }
    rows.push(...(data ?? []));
  }
  return { available: true, rows };
}

function toState(row: StateRow | null): PlayerCheckpointState | null {
  if (!row) return null;
  return {
    last_checkpoint_round_id: row.last_checkpoint_round_id,
    last_checkpoint_at: row.last_checkpoint_at,
    checkpoint_count: row.checkpoint_count ?? 0,
    rounds_since: row.rounds_since ?? 0,
    attempts_since: parseAttempts(row.attempts_since),
  };
}

async function processPlayer(
  supabase: Client,
  playerId: string,
  reads: readonly LifecycleReadRow[],
  stateRow: StateRow | null,
  allCorrections: readonly CorrectionRow[],
  now: Date,
  result: LifecycleRunResult,
): Promise<void> {
  const nowIso = now.toISOString();
  const { data: roundData, error: roundErr } = (await fromUntyped(supabase, 'golf_rounds')
    .select('id, round_date, created_at, status, is_test, holes_played, total_score, front_nine, back_nine, total_putts')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .eq('is_test', false)
    .order('round_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(ROUNDS_LIMIT)) as { data: RoundRow[] | null; error: { message: string } | null };
  if (roundErr) throw new Error(`rounds query failed: ${roundErr.message}`);
  const countable = (roundData ?? []).filter((r) => r.round_date && isCountableRound(r));
  const ordered = countable.map((r) => ({ id: r.id, round_date: r.round_date!, created_at: r.created_at }));

  const prior = toState(stateRow);
  const anchorIdx = prior?.last_checkpoint_round_id ? ordered.findIndex((r) => r.id === prior.last_checkpoint_round_id) : -1;
  const sinceIds = anchorIdx > 0 ? ordered.slice(0, anchorIdx).map((r) => r.id) : [];
  const windows = recheckWindows(ordered, nowIso);
  const windowIds = new Set([...windows.newest_15_rounds, ...windows.last_90_days]);
  const shotRoundIds = [...new Set([...sinceIds, ...windowIds])];

  const shots = await loadShots(supabase, shotRoundIds);
  const decision = evaluateCheckpoint(prior, ordered, shots, nowIso);
  if (decision.kind === 'baseline') result.checkpoints.baseline += 1;
  else if (decision.kind === 'player') result.checkpoints.player += 1;
  else if (decision.families.length > 0) result.checkpoints.family += 1;
  else result.checkpoints.none += 1;

  const holes = await loadHoles(supabase, [...windowIds]);
  const rechecks = new Map<string, RecheckRecord>();
  if (anyCheckpoint(decision)) {
    const putts: RecentPutt[] = shots
      .filter((s) => (s.shot_type ?? '').toLowerCase() === 'putting')
      .map((s) => ({ round_id: s.round_id, distance_to_hole_before: s.distance_to_hole_before, result: s.result, putt_made: s.putt_made }));
    for (const read of reads) {
      const ev = read.evidence;
      const metric = ev?.metric ?? '';
      if (!checkpointCovers(decision, familyForMetric(metric))) continue;
      if (typeof ev?.comparison_value !== 'number' || typeof ev?.your_value !== 'number') continue;
      const target = { benchmark: ev.comparison_value, oldValue: ev.your_value, oldN: ev.sample_n ?? 0 };
      const band = PUTT_BAND_BY_METRIC[metric];
      const par = PAR_BY_METRIC[metric];
      if (read.insight_type === 'putt_distance' && band) {
        if (!isWeaknessTarget(target, 'higher_better')) continue;
        rechecks.set(
          read.id,
          recheckOnBestWindow(windows, (w, ids) => puttBandRecheck(putts.filter((p) => ids.has(p.round_id)), band, target, w, nowIso)),
        );
      } else if (read.insight_type === 'par_scoring' && par) {
        if (!isWeaknessTarget(target, 'lower_better')) continue;
        rechecks.set(
          read.id,
          recheckOnBestWindow(windows, (w, ids) => parScoringRecheck(holes.filter((h) => ids.has(h.round_id)), par, target, w, nowIso)),
        );
      }
    }
  }

  const windowRoundRows = countable.filter((r) => windowIds.has(r.id)).map((r) => ({ id: r.id, total_score: r.total_score }));
  const flagged = new Set(holeSumMismatchRoundIds(windowRoundRows, holes));
  const link = countDriverPenaltyLink(shots, windows.newest_15_rounds);
  const readIds = new Set(reads.map((r) => r.id));

  const plan = planPlayer({
    reads,
    decision,
    rechecks,
    newestCountableRoundDate: ordered[0]?.round_date.slice(0, 10) ?? null,
    corrections: allCorrections.filter((c) => readIds.has(c.insight_id)),
    flaggedRoundIds: flagged,
    link,
    nowIso,
  });

  for (const patch of plan.patches) {
    const applied = await writePatch(supabase, patch, nowIso);
    if (applied) result.patches += 1;
    else result.lost_cas += 1;
  }
  const t = result.totals;
  const c = plan.counts;
  t.covered += c.covered;
  t.rechecked += c.rechecked;
  t.cleared += c.cleared;
  t.holds += c.holds;
  t.conflicts += c.conflicts;
  t.under_review += c.under_review;
  t.restored += c.restored;
  for (const [k, v] of Object.entries(c.archived)) t.archived[k] = (t.archived[k] ?? 0) + (v ?? 0);

  // State last: a failed patch above throws before the counter moves, so the
  // checkpoint is re-evaluated tomorrow rather than lost.
  const next = decision.next;
  const { error: stateErr } = await supabase.from(STATE_TABLE).upsert(
    {
      player_id: playerId,
      last_checkpoint_round_id: next.last_checkpoint_round_id,
      last_checkpoint_at: next.last_checkpoint_at,
      checkpoint_count: next.checkpoint_count,
      rounds_since: next.rounds_since,
      attempts_since: next.attempts_since,
      updated_at: nowIso,
    },
    { onConflict: 'player_id' },
  );
  if (stateErr) throw new Error(`state upsert failed: ${stateErr.message}`);
}

async function loadShots(supabase: Client, roundIds: readonly string[]): Promise<ShotRow[]> {
  const out: ShotRow[] = [];
  for (const ids of chunks(roundIds)) {
    const { data, error } = await fetchAllRowsResult<ShotRow>((from, to) =>
      fromUntyped(supabase, 'golf_shots')
        .select(
          'id, round_id, hole_number, shot_number, shot_type, lie_before, club_type, distance_to_hole_before, distance_unit_before, result, putt_made, is_penalty',
        )
        .in('round_id', ids)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (error) throw new Error(`shots query failed: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

async function loadHoles(supabase: Client, roundIds: readonly string[]): Promise<RecentHole[]> {
  const out: RecentHole[] = [];
  for (const ids of chunks(roundIds)) {
    const { data, error } = await fetchAllRowsResult<RecentHole & { id: string }>((from, to) =>
      fromUntyped(supabase, 'golf_holes')
        .select('id, round_id, par, score')
        .in('round_id', ids)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (error) throw new Error(`holes query failed: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** Compare-and-set on the observed lifecycle and update time. */
async function writePatch(supabase: Client, patch: ReadPatch, nowIso: string): Promise<boolean> {
  const payload: Record<string, unknown> = { metadata: patch.metadata, updated_at: nowIso };
  if (patch.evidence) payload.evidence = patch.evidence;
  if (patch.lifecycle_state) payload.lifecycle_state = patch.lifecycle_state;
  if (patch.archived_at !== undefined) payload.archived_at = patch.archived_at;
  let q = fromUntyped(supabase, 'golf_coach_insights').update(payload).eq('id', patch.id);
  q = patch.observedLifecycle === null ? q.is('lifecycle_state', null) : q.eq('lifecycle_state', patch.observedLifecycle);
  if (patch.observedUpdatedAt) q = q.eq('updated_at', patch.observedUpdatedAt);
  const { data, error } = (await q.select('id')) as { data: Array<{ id: string }> | null; error: { message: string } | null };
  if (error) throw new Error(`insight update failed: ${error.message}`);
  return !!data && data.length > 0;
}
