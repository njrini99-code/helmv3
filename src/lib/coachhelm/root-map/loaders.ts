/**
 * ============================================================================
 * Root map loaders: small, bounded READS of stored data
 * ----------------------------------------------------------------------------
 * Plain server-side functions (NOT `'use server'` actions) that the RSC pages
 * call with their own request-scoped Supabase client, so RLS applies exactly
 * as it does for every other read on those pages. No generator runs, no shot
 * scan, no writes (PR #2068): each function is one indexed select over
 * columns the stats pipeline already stored, with a hard row bound.
 *
 * Failure contract: every loader returns `null` on a failed read (logged as a
 * warning) and `[]` for a genuine "no rows". Callers render an honest empty
 * state for `[]` and omit the element for `null`; neither is ever turned into
 * a number.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  STORED_SG_COLUMNS as SG_COLUMNS,
  areaRoundFromStored as toAreaRound,
  averageAreaSg,
  type AreaSgRound,
  type PlayerAreaSg,
  type StoredSgRoundRow as SgRoundRow,
  type TeamSgRound,
} from './area-trends';
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';
import { GREEN_MAX_FT, type GreenPuttInput } from './green-view';
import type { ApproachRoundInput, RawHoleRow, RawShotRow } from './approach-context';
import { normalizeShot } from '@/lib/coachhelm/v3/context/normalize-shot';
import type { HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';

type Sb = SupabaseClient<Database>;

/** PostgREST `.in()` lists ride in the URL; keep each chunk well short of the
 *  length limit (uuid ≈ 37 chars with its comma). */
const IN_CHUNK = 60;

function chunk<T>(xs: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function warn(message: string, action: string, err: unknown): void {
  void logServerError(`${message}: ${describeError(err)}`, { action, featureArea: 'coachhelm', skipSentry: true }, 'warning').catch(
    () => undefined,
  );
}

/**
 * The player's most recent completed rounds with their stored per-round SG,
 * newest first. `limit` rounds max (default 10: 5 recent vs 5 before).
 */
export async function loadRecentAreaSgRounds(sb: Sb, playerId: string, limit = 10): Promise<AreaSgRound[] | null> {
  try {
    const { data, error } = await sb
      .from('golf_rounds')
      .select(SG_COLUMNS)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      // Over-fetch so non-countable rounds dropped below don't shrink the window.
      .limit(limit * 2);
    if (error) throw error;
    return ((data ?? []) as SgRoundRow[])
      .map(toAreaRound)
      .filter((r): r is AreaSgRound => r !== null)
      .slice(0, limit);
  } catch (err) {
    warn(`[root-map] recent SG rounds read failed for player ${playerId}`, 'rootMap.loadRecentAreaSgRounds', err);
    return null;
  }
}

/**
 * Roster rounds since `sinceDate` (date-only), with stored per-round SG.
 * Bounded by the window and paged past the 1000-row cap on a stable order.
 */
export async function loadTeamSgRounds(sb: Sb, playerIds: string[], sinceDate: string): Promise<TeamSgRound[] | null> {
  if (playerIds.length === 0) return [];
  try {
    const out: TeamSgRound[] = [];
    for (const ids of chunk(playerIds)) {
      const { data, error } = await fetchAllRowsResult<SgRoundRow & { id: string; player_id: string }>(
        (from, to) =>
          sb
            .from('golf_rounds')
            .select(`id, player_id, ${SG_COLUMNS}`)
            .in('player_id', ids)
            .eq('status', 'completed')
            .gte('round_date', sinceDate)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: (SgRoundRow & { id: string; player_id: string })[] | null;
            error: { message: string; code?: string | null } | null;
          }>,
        undefined,
        { table: 'golf_rounds', action: 'rootMap.loadTeamSgRounds', feature: 'coachhelm_ai_engine', sport: 'golf' },
      );
      if (error) throw error;
      for (const row of data ?? []) {
        const r = toAreaRound(row);
        if (r) out.push({ ...r, playerId: row.player_id });
      }
    }
    return out;
  } catch (err) {
    warn('[root-map] team SG rounds read failed', 'rootMap.loadTeamSgRounds', err);
    return null;
  }
}

export interface PlayerAreaSgRow extends PlayerAreaSg {
  playerId: string;
}

/**
 * Per-round area SG for each player, averaged over their COUNTABLE completed
 * rounds (per 18 holes) from the stored `golf_rounds.strokes_gained_*`.
 *
 * Deliberately NOT `golf_player_stats_cache.sg_*_per_round`: that cache is
 * written by the SQL function `update_player_stats_strokes_gained(uuid)`
 * (called from `src/lib/cache/golf-stats-calculator.ts`), which averages every
 * completed round, so one mis-entered round (37 strokes over "18 holes", SG
 * tee +17.89) moved one player's putting from -4.09 to -2.93 per round. Fixing the writer
 * is a migration; until then the root map computes its own average here.
 *
 * Bounded: one indexed select per chunk of players, paged past the 1000-row
 * cap on a stable order. Players with no countable SG round get no row.
 */
export async function loadPlayersAreaSg(sb: Sb, playerIds: string[]): Promise<PlayerAreaSgRow[] | null> {
  if (playerIds.length === 0) return [];
  try {
    const byPlayer = new Map<string, AreaSgRound[]>();
    for (const ids of chunk(playerIds)) {
      const { data, error } = await fetchAllRowsResult<SgRoundRow & { id: string; player_id: string }>(
        (from, to) =>
          sb
            .from('golf_rounds')
            .select(`id, player_id, ${SG_COLUMNS}`)
            .in('player_id', ids)
            .eq('status', 'completed')
            .not('strokes_gained_total', 'is', null)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: (SgRoundRow & { id: string; player_id: string })[] | null;
            error: { message: string; code?: string | null } | null;
          }>,
        undefined,
        { table: 'golf_rounds', action: 'rootMap.loadPlayersAreaSg', feature: 'coachhelm_ai_engine', sport: 'golf' },
      );
      if (error) throw error;
      for (const row of data ?? []) {
        const r = toAreaRound(row);
        if (!r) continue;
        const list = byPlayer.get(row.player_id) ?? [];
        list.push(r);
        byPlayer.set(row.player_id, list);
      }
    }
    const out: PlayerAreaSgRow[] = [];
    for (const [playerId, rounds] of byPlayer) {
      const avg = averageAreaSg(rounds);
      if (avg.roundsPlayed > 0) out.push({ playerId, ...avg });
    }
    return out;
  } catch (err) {
    warn('[root-map] countable area SG read failed', 'rootMap.loadPlayersAreaSg', err);
    return null;
  }
}

/** Rounds the green view reads back (newest countable rounds). */
export const GREEN_ROUND_LIMIT = 40;

export interface ShortPuttSample {
  rounds: number;
  putts: GreenPuttInput[];
}

/**
 * Recorded putts inside 6 ft with a slope, from the player's most recent
 * {@link GREEN_ROUND_LIMIT} countable completed rounds: the Why view's green.
 *
 * Bounded: one select for the rounds (over-fetched so non-countable ones do
 * not shrink the window) and one paged select for their putts, filtered in the
 * query to putting shots at 0-6 ft with a downhill/level/uphill slope.
 */
export async function loadShortPuttSlopes(sb: Sb, playerId: string): Promise<ShortPuttSample | null> {
  try {
    const { data: rounds, error: rErr } = await sb
      .from('golf_rounds')
      .select('id, holes_played, total_score, front_nine, back_nine, total_putts, strokes_gained_total')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(GREEN_ROUND_LIMIT + 20);
    if (rErr) throw rErr;
    const roundIds = ((rounds ?? []) as Array<CountableRoundInput & { id: string }>)
      .filter(isCountableRound)
      .slice(0, GREEN_ROUND_LIMIT)
      .map((r) => r.id);
    if (roundIds.length === 0) return { rounds: 0, putts: [] };

    type Row = { id: string; putt_distance_feet: number | null; putt_slope: string | null; putt_made: boolean | null };
    const putts: GreenPuttInput[] = [];
    for (const ids of chunk(roundIds)) {
      const { data, error } = await fetchAllRowsResult<Row>(
        (from, to) =>
          sb
            .from('golf_shots')
            .select('id, putt_distance_feet, putt_slope, putt_made')
            .in('round_id', ids)
            .eq('shot_type', 'putting')
            .gt('putt_distance_feet', 0)
            .lte('putt_distance_feet', GREEN_MAX_FT)
            .in('putt_slope', ['downhill', 'level', 'uphill'])
            .not('putt_made', 'is', null)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: Row[] | null;
            error: { message: string; code?: string | null } | null;
          }>,
        undefined,
        { table: 'golf_shots', action: 'rootMap.loadShortPuttSlopes', feature: 'coachhelm_ai_engine', sport: 'golf' },
      );
      if (error) throw error;
      for (const row of data ?? []) {
        const feet = num(row.putt_distance_feet);
        if (feet === null || row.putt_made === null) continue;
        putts.push({ id: row.id, feet, slope: row.putt_slope, made: row.putt_made });
      }
    }
    return { rounds: roundIds.length, putts };
  } catch (err) {
    warn(`[root-map] short-putt slope read failed for player ${playerId}`, 'rootMap.loadShortPuttSlopes', err);
    return null;
  }
}

export interface StoredAttributionRow {
  insightId: string;
  targetMetricId: string;
  baseline: number;
  post: number;
  nBefore: number;
  nAfter: number;
  methodVersion: string | null;
}

/**
 * Stored outcome-attribution rows for the given insights (the table the
 * comparable-opportunity cron writes). RLS limits them to the coach who owns
 * each insight. The CALLER checks the attribution flag first.
 */
export async function loadAttributionForInsights(sb: Sb, insightIds: string[]): Promise<StoredAttributionRow[] | null> {
  if (insightIds.length === 0) return [];
  try {
    const out: StoredAttributionRow[] = [];
    for (const ids of chunk(insightIds)) {
      const { data, error } = await sb
        .from('golf_insight_outcome_attribution')
        .select('insight_id, target_metric_id, baseline_value, post_value, n_rounds_before, n_rounds_after, method_version')
        .in('insight_id', ids);
      if (error) throw error;
      for (const row of data ?? []) {
        const baseline = num(row.baseline_value);
        const post = num(row.post_value);
        if (baseline === null || post === null) continue;
        out.push({
          insightId: row.insight_id,
          targetMetricId: row.target_metric_id,
          baseline,
          post,
          nBefore: row.n_rounds_before ?? 0,
          nAfter: row.n_rounds_after ?? 0,
          methodVersion: row.method_version ?? null,
        });
      }
    }
    return out;
  } catch (err) {
    warn('[root-map] attribution read failed', 'rootMap.loadAttributionForInsights', err);
    return null;
  }
}

/** Rounds the approach context reads back (newest countable rounds). */
export const APPROACH_ROUND_LIMIT = 40;

const APPROACH_SHOT_COLUMNS =
  'id, round_id, hole_id, hole_number, shot_number, shot_type, club_type, lie_before, lie_after, result, ' +
  'distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, ' +
  'is_penalty, putt_made, miss_direction, created_at, putt_distance_feet';

const APPROACH_HOLE_COLUMNS = 'id, round_id, hole_number, par, yardage, score, penalty_strokes, putts, gir';

export interface ApproachContextLoad {
  rounds: ApproachRoundInput[];
  holes: RawHoleRow[];
  shots: RawShotRow[];
  /** `sg_scale_for_player` (1 when it could not be read; the band sizing's
   *  reconciliation against the stored SG catches a wrong scale). */
  scale: number;
}

/**
 * The player's most recent {@link APPROACH_ROUND_LIMIT} countable completed
 * rounds with a stored SG, their holes and every recorded shot: the input to
 * the approach band sizing and the Why view's length / par / shape evidence
 * (`approach-context.ts`). Request client, so RLS applies (`golf_holes_select`
 * / `golf_shots_select` let a player read their own rows).
 *
 * Bounded: one select for the rounds (over-fetched so non-countable ones do
 * not shrink the window), then one paged select per chunk for holes and for
 * shots. Nothing is computed here.
 */
export async function loadApproachContext(sb: Sb, playerId: string): Promise<ApproachContextLoad | null> {
  try {
    const { data: roundRows, error: rErr } = await sb
      .from('golf_rounds')
      .select(`id, ${SG_COLUMNS}`)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('strokes_gained_total', 'is', null)
      .order('round_date', { ascending: false })
      .limit(APPROACH_ROUND_LIMIT + 20);
    if (rErr) throw rErr;
    const rounds: ApproachRoundInput[] = [];
    for (const row of (roundRows ?? []) as Array<SgRoundRow & { id: string }>) {
      const r = toAreaRound(row);
      if (!r) continue;
      rounds.push({ id: row.id, date: r.date, holesPlayed: row.holes_played ?? 18, storedApproach: num(row.strokes_gained_approach) });
      if (rounds.length >= APPROACH_ROUND_LIMIT) break;
    }
    if (rounds.length === 0) return { rounds: [], holes: [], shots: [], scale: 1 };
    const ids = rounds.map((r) => r.id);

    const holes: RawHoleRow[] = [];
    const shots: RawShotRow[] = [];
    for (const idChunk of chunk(ids)) {
      const { data: h, error: hErr } = await fetchAllRowsResult<RawHoleRow>(
        (from, to) =>
          sb
            .from('golf_holes')
            .select(APPROACH_HOLE_COLUMNS)
            .in('round_id', idChunk)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: RawHoleRow[] | null;
            error: { message: string; code?: string | null } | null;
          }>,
        undefined,
        { table: 'golf_holes', action: 'rootMap.loadApproachContext', feature: 'coachhelm_ai_engine', sport: 'golf' },
      );
      if (hErr) throw hErr;
      holes.push(...(h ?? []));
      const { data: s, error: sErr } = await fetchAllRowsResult<RawShotRow>(
        (from, to) =>
          sb
            .from('golf_shots')
            .select(APPROACH_SHOT_COLUMNS)
            .in('round_id', idChunk)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: RawShotRow[] | null;
            error: { message: string; code?: string | null } | null;
          }>,
        undefined,
        { table: 'golf_shots', action: 'rootMap.loadApproachContext', feature: 'coachhelm_ai_engine', sport: 'golf' },
      );
      if (sErr) throw sErr;
      shots.push(...(s ?? []));
    }

    let scale = 1;
    const { data: sc, error: scErr } = await sb.rpc('sg_scale_for_player', { p_player_id: playerId });
    if (!scErr && num(sc) !== null && (num(sc) as number) > 0) scale = num(sc) as number;
    return { rounds, holes, shots, scale };
  } catch (err) {
    warn(`[root-map] approach context read failed for player ${playerId}`, 'rootMap.loadApproachContext', err);
    return null;
  }
}

/** Raw rows → the A1 shapes the narrowing reads (holes need a score). */
export function toContextFacts(load: ApproachContextLoad): { facts: ShotFact[]; holes: HoleContext[] } {
  const holes: HoleContext[] = [];
  for (const h of load.holes) {
    if (h.score === null || typeof h.par !== 'number' || h.hole_number === null) continue;
    holes.push({
      round_id: h.round_id,
      course_id: null,
      hole_number: h.hole_number,
      par: h.par,
      yardage: h.yardage,
      total_strokes: h.score,
      penalty_strokes: h.penalty_strokes,
      putts: h.putts,
      gir: h.gir,
    });
  }
  const scored = new Set(holes.map((h) => `${h.round_id}:${h.hole_number}`));
  const dateByRound = new Map(load.rounds.map((r) => [r.id, r.date]));
  const facts: ShotFact[] = [];
  for (const s of load.shots) {
    if (!scored.has(`${s.round_id}:${s.hole_number}`)) continue;
    facts.push(
      normalizeShot({
        round_id: s.round_id,
        hole_number: s.hole_number,
        shot_number: s.shot_number,
        shot_type: s.shot_type,
        club_type: s.club_type,
        distance_to_hole_before: s.distance_to_hole_before,
        distance_unit_before: s.distance_unit_before,
        distance_to_hole_after: s.distance_to_hole_after,
        distance_unit_after: s.distance_unit_after,
        lie_before: s.lie_before,
        lie_after: s.lie_after,
        result: s.result,
        is_penalty: s.is_penalty,
        putt_made: s.putt_made,
        miss_direction: s.miss_direction,
        observed_at: s.created_at ?? `${dateByRound.get(s.round_id) ?? '1970-01-01'}T00:00:00Z`,
      }),
    );
  }
  return { facts, holes };
}

/** One player's rounds for the team shot read, plus a freshness stamp. */
export interface TeamShotRounds {
  rounds: ApproachRoundInput[];
  /** Newest `updated_at` (else `created_at`) over the chosen rounds: an edit
   *  to one of them moves it, so the cache key moves with it. */
  stamp: string;
}

/**
 * Step 1 of the team shot read: each roster player's newest
 * {@link APPROACH_ROUND_LIMIT} countable completed rounds with a stored SG.
 * Always run with the REQUEST client, so RLS (`golf_rounds_select_team`)
 * decides which rounds the coach may see. Throws on a failed read.
 */
export async function selectTeamShotRounds(sb: Sb, playerIds: string[]): Promise<Map<string, TeamShotRounds>> {
  const out = new Map<string, TeamShotRounds>();
  if (playerIds.length === 0) return out;
  type RoundRow = SgRoundRow & { id: string; player_id: string; updated_at: string | null; created_at: string | null };
  const byPlayer = new Map<string, RoundRow[]>();
  for (const ids of chunk(playerIds)) {
    const { data, error } = await fetchAllRowsResult<RoundRow>(
      (from, to) =>
        sb
          .from('golf_rounds')
          .select(`id, player_id, updated_at, created_at, ${SG_COLUMNS}`)
          .in('player_id', ids)
          .eq('status', 'completed')
          .not('strokes_gained_total', 'is', null)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
          data: RoundRow[] | null;
          error: { message: string; code?: string | null } | null;
        }>,
      undefined,
      { table: 'golf_rounds', action: 'rootMap.loadTeamShotContext', feature: 'coachhelm_ai_engine', sport: 'golf' },
    );
    if (error) throw error;
    for (const row of data ?? []) {
      const list = byPlayer.get(row.player_id) ?? [];
      list.push(row);
      byPlayer.set(row.player_id, list);
    }
  }
  for (const [playerId, rows] of byPlayer) {
    rows.sort((a, b) => ((a.round_date ?? '') < (b.round_date ?? '') ? 1 : -1));
    const rounds: ApproachRoundInput[] = [];
    let stamp = '';
    for (const row of rows) {
      const r = toAreaRound(row);
      if (!r) continue;
      rounds.push({ id: row.id, date: r.date, holesPlayed: row.holes_played ?? 18, storedApproach: num(row.strokes_gained_approach) });
      const ts = row.updated_at ?? row.created_at ?? '';
      if (ts > stamp) stamp = ts;
      if (rounds.length >= APPROACH_ROUND_LIMIT) break;
    }
    if (rounds.length > 0) out.set(playerId, { rounds, stamp });
  }
  return out;
}

/** Holes, shots and SG scale for one player's chosen rounds. */
export interface TeamShotChildren {
  holes: RawHoleRow[];
  shots: RawShotRow[];
  scale: number;
}

/**
 * Step 2 of the team shot read: the holes and shots of rounds step 1 already
 * returned, and each player's SG scale. Only ever called with round ids from
 * {@link selectTeamShotRounds} (so the rounds were RLS-checked first), which
 * lets the cached path run it with the service client. Throws on a failed
 * read.
 */
export async function loadTeamShotChildren(sb: Sb, roundIdsByPlayer: ReadonlyMap<string, readonly string[]>): Promise<Map<string, TeamShotChildren>> {
  const out = new Map<string, TeamShotChildren>();
  const playerOfRound = new Map<string, string>();
  const roundIds: string[] = [];
  for (const [playerId, ids] of roundIdsByPlayer) {
    out.set(playerId, { holes: [], shots: [], scale: 1 });
    for (const id of ids) {
      playerOfRound.set(id, playerId);
      roundIds.push(id);
    }
  }
  if (roundIds.length === 0) return out;

  // Chunks run in parallel (a 15-player roster is ~20k shots, ~7 chunks):
  // sequential paging took 3–6 s against production.
  const loadChunk = async (idChunk: string[]) => {
    const [h, s] = await Promise.all([
      fetchAllRowsResult<RawHoleRow>(
        (from, to) =>
          sb
            .from('golf_holes')
            .select(APPROACH_HOLE_COLUMNS)
            .in('round_id', idChunk)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: RawHoleRow[] | null;
            error: { message: string; code?: string | null } | null;
          }>,
        undefined,
        { table: 'golf_holes', action: 'rootMap.loadTeamShotContext', feature: 'coachhelm_ai_engine', sport: 'golf' },
      ),
      fetchAllRowsResult<RawShotRow>(
        (from, to) =>
          sb
            .from('golf_shots')
            .select(APPROACH_SHOT_COLUMNS)
            .in('round_id', idChunk)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: RawShotRow[] | null;
            error: { message: string; code?: string | null } | null;
          }>,
        undefined,
        { table: 'golf_shots', action: 'rootMap.loadTeamShotContext', feature: 'coachhelm_ai_engine', sport: 'golf' },
      ),
    ]);
    if (h.error) throw h.error;
    if (s.error) throw s.error;
    return { holes: h.data ?? [], shots: s.data ?? [] };
  };
  const chunks = chunk(roundIds, 40);
  const loaded: Array<{ holes: RawHoleRow[]; shots: RawShotRow[] }> = [];
  for (let i = 0; i < chunks.length; i += 6) loaded.push(...(await Promise.all(chunks.slice(i, i + 6).map(loadChunk))));
  for (const part of loaded) {
    for (const row of part.holes) out.get(playerOfRound.get(row.round_id) ?? '')?.holes.push(row);
    for (const row of part.shots) out.get(playerOfRound.get(row.round_id) ?? '')?.shots.push(row);
  }

  await Promise.all(
    [...out.entries()].map(async ([playerId, load]) => {
      const { data: sc, error } = await sb.rpc('sg_scale_for_player', { p_player_id: playerId });
      if (!error && num(sc) !== null && (num(sc) as number) > 0) load.scale = num(sc) as number;
    }),
  );
  return out;
}

/**
 * The team root map's measured What row input: for every roster player, the
 * same countable rounds `loadApproachContext` reads (newest
 * {@link APPROACH_ROUND_LIMIT} with a stored SG), their holes and shots, and
 * the player's SG scale. Batched across the roster (one paged select per
 * chunk of players or rounds) instead of one approach load per player.
 * Request client, so RLS applies (`is_golf_team_coach`). Null on a failed
 * read; players with no countable round are absent from the map.
 *
 * Uncached. The coach Brief uses `loadTeamShotContextCached`
 * (`team-shot-cache.ts`), which runs the same two steps.
 */
export async function loadTeamShotContext(sb: Sb, playerIds: string[]): Promise<Map<string, ApproachContextLoad> | null> {
  try {
    const picked = await selectTeamShotRounds(sb, playerIds);
    const children = await loadTeamShotChildren(sb, new Map([...picked].map(([p, v]) => [p, v.rounds.map((r) => r.id)])));
    const out = new Map<string, ApproachContextLoad>();
    for (const [playerId, { rounds }] of picked) {
      const c = children.get(playerId) ?? { holes: [], shots: [], scale: 1 };
      out.set(playerId, { rounds, holes: c.holes, shots: c.shots, scale: c.scale });
    }
    return out;
  } catch (err) {
    warn('[root-map] team shot context read failed', 'rootMap.loadTeamShotContext', err);
    return null;
  }
}
