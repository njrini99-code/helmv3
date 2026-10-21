/**
 * The team pool loader (CoachHelm Slice 7a). One batched read of a team's
 * countable rounds, holes and shots per team per generation run, shared by
 * every generator that asks within the memo window, then the pure pool
 * (`pool.ts`) per read.
 *
 * Client: the v3 generators already read with the service-role client the
 * base hands them (`createAdminClient()`, the same client that reads the
 * team's standing and the player's rounds); this loader takes that client
 * as an argument and adds no new read path. It reads only aggregate inputs
 * (scores, putts, flags); no name or profile field is selected, and nothing
 * about a single teammate leaves this module except inside a pooled count.
 *
 * Reads, each bound and error-checked: active memberships for the team; the
 * roster's test flags; completed, non-test rounds (`.in()` chunked with
 * `chunkIds`, pages past the 1,000-row cap with `fetchAllRowsResult`); the
 * holes and the putting and approach shots of the countable ones. Any error
 * means "no pool": it is logged with `logServerEvent` and the read is written
 * exactly as it would be without the flag.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerEvent } from '@/lib/server-error-logger';
import { approachFoundGreen, bucketApproachDistance } from '@/lib/coachhelm/v3/engine/shot-source';
import type { PoolApproach, PoolHole, PoolPlayer, PoolPutt, PoolRound } from './pool';

/** How long one team's rows serve later generators (one engine pass). */
export const TEAM_POOL_MEMO_TTL_MS = 5 * 60_000;
/** How far back the rounds are read. Production's first round is 2026-02-27,
 *  so this loses nothing today; it bounds the read as history grows. */
export const TEAM_POOL_LOOKBACK_DAYS = 730;

const ROUND_COLUMNS =
  'id, player_id, round_date, is_test, holes_played, total_score, front_nine, back_nine, total_putts';

type DbError = { message: string; code?: string | null };
type Rows<T> = PromiseLike<{ data: T[] | null; error: DbError | null }>;

interface RoundRow {
  id: string;
  player_id: string;
  round_date: string;
  is_test: boolean | null;
  holes_played: number | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
}

interface HoleRow extends PoolHole {
  round_id: string;
}

interface ShotRow {
  round_id: string;
  shot_type: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  result: string | null;
  lie_after: string | null;
  putt_made: boolean | null;
}

class PoolLoadError extends Error {
  constructor(readonly step: string, readonly dbError: DbError) {
    super(`${step}: ${dbError.message}`);
  }
}

const memo = new Map<string, { at: number; promise: Promise<PoolPlayer[] | null> }>();

/** Test hook: forget memoised teams. */
export function __resetTeamPoolMemo(): void {
  memo.clear();
}

async function logFailure(step: string, extra: Record<string, unknown>): Promise<void> {
  try {
    await logServerEvent(
      `coachhelm.teamPool: ${step} failed; reads keep their current comparison`,
      { action: 'coachhelm.v3.teamPool.load', featureArea: 'coachhelm', extra },
      'warning',
    );
  } catch {
    // Logging never fails a generator run.
  }
}

/**
 * The player's one active team, or null when they have none or more than one
 * (production 2026-10-20: every rostered player has exactly one). On a read
 * error, null and a log line.
 */
export async function resolvePlayerTeam(supabase: SupabaseClient, playerId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .eq('status', 'active');
    if (error) {
      await logFailure('team lookup', { playerId, code: error.code ?? null });
      return null;
    }
    const teams = [...new Set((data ?? []).map((r: { team_id: string }) => r.team_id))];
    return teams.length === 1 ? (teams[0] as string) : null;
  } catch (err) {
    await logFailure('team lookup', { playerId, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function chunked<T>(ids: readonly string[], query: (chunk: string[], from: number, to: number) => Rows<T>, step: string): Promise<T[]> {
  const out: T[] = [];
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await fetchAllRowsResult<T>((from, to) => query(chunk, from, to));
    if (error) throw new PoolLoadError(step, error);
    out.push(...(data ?? []));
  }
  return out;
}

async function loadTeamRows(supabase: SupabaseClient, teamId: string, now: number): Promise<PoolPlayer[]> {
  const { data: members, error: mErr } = await fetchAllRowsResult<{ player_id: string }>((from, to) =>
    supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .order('player_id', { ascending: true })
      .range(from, to) as unknown as Rows<{ player_id: string }>,
  );
  if (mErr) throw new PoolLoadError('roster', mErr);
  const rosterIds = [...new Set((members ?? []).map((m) => m.player_id))];
  if (rosterIds.length === 0) return [];

  const testPlayers = await chunked<{ id: string }>(
    rosterIds,
    (chunk, from, to) =>
      supabase
        .from('golf_players')
        .select('id')
        .in('id', chunk)
        .eq('is_test', true)
        .order('id', { ascending: true })
        .range(from, to) as unknown as Rows<{ id: string }>,
    'test players',
  );
  const excluded = new Set(testPlayers.map((p) => p.id));
  const playerIds = rosterIds.filter((id) => !excluded.has(id));
  if (playerIds.length === 0) return [];

  const since = new Date(now - TEAM_POOL_LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10);
  const rounds = await chunked<RoundRow>(
    playerIds,
    (chunk, from, to) =>
      supabase
        .from('golf_rounds')
        .select(ROUND_COLUMNS)
        .in('player_id', chunk)
        .eq('status', 'completed')
        .eq('is_test', false)
        .gte('round_date', since)
        .order('id', { ascending: true })
        .range(from, to) as unknown as Rows<RoundRow>,
    'rounds',
  );
  // Every completed, non-test round: the approach and sand pools use them all,
  // as the player's own value does; the pure pool applies each family's rule
  // (`roundRuleFor`) and the countable floors.
  const kept = rounds.filter((r) => r.is_test !== true);
  const roundIds = kept.map((r) => r.id);

  const holes = roundIds.length
    ? await chunked<HoleRow>(
        roundIds,
        (chunk, from, to) =>
          supabase
            .from('golf_holes')
            .select('round_id, par, score, putts, penalty_strokes, gir, sand_save, up_and_down')
            .in('round_id', chunk)
            .order('id', { ascending: true })
            .range(from, to) as unknown as Rows<HoleRow>,
        'holes',
      )
    : [];
  const shots = roundIds.length
    ? await chunked<ShotRow>(
        roundIds,
        (chunk, from, to) =>
          supabase
            .from('golf_shots')
            .select(
              'round_id, shot_type, distance_to_hole_before, distance_unit_before, distance_to_hole_after, result, lie_after, putt_made',
            )
            .in('round_id', chunk)
            .in('shot_type', ['putting', 'approach'])
            .order('id', { ascending: true })
            .range(from, to) as unknown as Rows<ShotRow>,
        'shots',
      )
    : [];

  return assembleTeamPlayers(playerIds, kept, holes, shots);
}

/**
 * Pure: group the rows into the pool's input, classifying each shot with the
 * same rules the player's read uses: a putt as `update_player_putt_make_pct`
 * reads it (raw `distance_to_hole_before`, made on `result = 'hole'` or
 * `putt_made`), an approach banded by `bucketApproachDistance` and judged by
 * `approachFoundGreen` (only shots with both distances, like
 * `loadApproachShots`).
 */
export function assembleTeamPlayers(
  playerIds: readonly string[],
  rounds: readonly RoundRow[],
  holes: readonly HoleRow[],
  shots: readonly ShotRow[],
): PoolPlayer[] {
  const holesBy = new Map<string, PoolHole[]>();
  for (const { round_id, ...h } of holes) {
    const list = holesBy.get(round_id) ?? [];
    list.push(h);
    holesBy.set(round_id, list);
  }
  const puttsBy = new Map<string, PoolPutt[]>();
  const approachesBy = new Map<string, PoolApproach[]>();
  for (const s of shots) {
    const type = (s.shot_type ?? '').toLowerCase();
    if (type === 'putting') {
      if (typeof s.distance_to_hole_before !== 'number' || !Number.isFinite(s.distance_to_hole_before)) continue;
      const list = puttsBy.get(s.round_id) ?? [];
      list.push({ feet: s.distance_to_hole_before, made: s.result === 'hole' || s.putt_made === true });
      puttsBy.set(s.round_id, list);
    } else if (type === 'approach') {
      if (typeof s.distance_to_hole_before !== 'number' || typeof s.distance_to_hole_after !== 'number') continue;
      const band = bucketApproachDistance(s.distance_to_hole_before, s.distance_unit_before);
      if (!band) continue;
      const list = approachesBy.get(s.round_id) ?? [];
      list.push({ band, green_hit: approachFoundGreen(s) });
      approachesBy.set(s.round_id, list);
    }
  }
  const roundsBy = new Map<string, PoolRound[]>();
  for (const r of rounds) {
    const list = roundsBy.get(r.player_id) ?? [];
    list.push({
      ...r,
      holes: holesBy.get(r.id) ?? [],
      putts: puttsBy.get(r.id) ?? [],
      approaches: approachesBy.get(r.id) ?? [],
    });
    roundsBy.set(r.player_id, list);
  }
  return playerIds.map((player_id) => ({ player_id, rounds: roundsBy.get(player_id) ?? [] }));
}

/**
 * The team's pool inputs, memoised per team for `TEAM_POOL_MEMO_TTL_MS` (one
 * engine pass: a player's generators run together, and a roster sweep runs the
 * team's players back to back). Concurrent callers share one load. Null on any
 * read error (logged; the failed load is not memoised).
 */
export async function loadTeamPoolPlayers(
  supabase: SupabaseClient,
  teamId: string,
  now: number = Date.now(),
): Promise<PoolPlayer[] | null> {
  const hit = memo.get(teamId);
  if (hit && now - hit.at < TEAM_POOL_MEMO_TTL_MS) return hit.promise;
  const promise = loadTeamRows(supabase, teamId, now).catch(async (err: unknown) => {
    memo.delete(teamId);
    const step = err instanceof PoolLoadError ? err.step : 'load';
    const code = err instanceof PoolLoadError ? (err.dbError.code ?? null) : null;
    await logFailure(step, { teamId, code, error: err instanceof Error ? err.message : String(err) });
    return null;
  });
  memo.set(teamId, { at: now, promise });
  return promise;
}
