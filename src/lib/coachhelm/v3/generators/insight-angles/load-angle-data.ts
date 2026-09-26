/**
 * DB side of the CoachHelm v3 insight angles (`angle-data.ts` is pure).
 *
 * One read per player, shared by the four angle generators: the newest
 * {@link ANGLE_ROUND_LIMIT} COUNTABLE completed rounds (`isCountableRound` —
 * the same rule as the root map and every other player-facing number), their
 * holes and every recorded shot, plus `sg_scale_for_player` and the scoring
 * baseline. Rounds are over-fetched so non-countable ones do not shrink the
 * window; holes and shots are read in id chunks with pagination (PostgREST
 * 1000-row cap).
 *
 * Memoized per player for a few minutes: one orchestrator pass runs all four
 * angles for the same player. Only the promise is cached, and a rejected load
 * is evicted so the next generator retries.
 *
 * Team peers (the volatility and fairway benchmarks) are one more read per
 * TEAM, memoized the same way: `golf_rounds` rows only (per-round score to par, SG and
 * fairways), never another player's shots.
 */
import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';
import { loadPlayerScoringBaseline } from '@/lib/coachhelm/v3/counterfactual/baseline-loader';
import {
  ANGLE_ROUND_LIMIT,
  type AngleData,
  type AngleHole,
  type AngleRound,
  type AngleShot,
  type PeerRound,
} from './angle-data';

const MEMO_TTL_MS = 5 * 60_000;
const IN_CHUNK = 60;
const playerMemo = new Map<string, { at: number; value: Promise<AngleData> }>();
const teamMemo = new Map<string, { at: number; value: Promise<PeerRound[]> }>();

const ROUND_COLUMNS =
  'id, round_date, team_id, status, holes_played, total_score, front_nine, back_nine, total_putts, ' +
  'strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting';
const HOLE_COLUMNS = 'id, round_id, hole_number, par, score, penalty_strokes, putts, fairway_hit, gir';
const SHOT_COLUMNS =
  'id, round_id, hole_id, hole_number, shot_number, shot_type, club_type, lie_before, lie_after, result, ' +
  'distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, is_penalty, ' +
  'putt_made, miss_direction, created_at, putt_distance_feet, putt_slope';

type Sb = ReturnType<typeof createAdminClient>;

function chunk<T>(xs: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type RoundRow = CountableRoundInput & {
  id: string;
  round_date: string;
  team_id: string | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
};

async function readAngleData(sb: Sb, playerId: string): Promise<AngleData> {
  const { data: roundRows, error: rErr } = await sb
    .from('golf_rounds')
    .select(ROUND_COLUMNS)
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .order('round_date', { ascending: false })
    .limit(ANGLE_ROUND_LIMIT + 20);
  if (rErr) throw new Error(`insight-angles rounds query failed: ${rErr.message}`);

  const rounds: AngleRound[] = [];
  for (const r of (roundRows ?? []) as unknown as RoundRow[]) {
    if (!isCountableRound(r)) continue;
    rounds.push({
      id: r.id,
      date: String(r.round_date).slice(0, 10),
      holes: r.holes_played ?? 18,
      team_id: r.team_id ?? null,
      sg: {
        total: num(r.strokes_gained_total),
        tee: num(r.strokes_gained_tee),
        approach: num(r.strokes_gained_approach),
        short_game: num(r.strokes_gained_around_green),
        putting: num(r.strokes_gained_putting),
      },
    });
    if (rounds.length >= ANGLE_ROUND_LIMIT) break;
  }

  const holes: AngleHole[] = [];
  const shots: AngleShot[] = [];
  for (const ids of chunk(rounds.map((r) => r.id))) {
    const { data: h, error: hErr } = await fetchAllRowsResult<AngleHole>((from, to) =>
      sb
        .from('golf_holes')
        .select(HOLE_COLUMNS)
        .in('round_id', ids)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: AngleHole[] | null; error: { message: string } | null }>,
    );
    if (hErr) throw new Error(`insight-angles holes query failed: ${hErr.message}`);
    holes.push(...(h ?? []));
    const { data: s, error: sErr } = await fetchAllRowsResult<AngleShot>((from, to) =>
      sb
        .from('golf_shots')
        .select(SHOT_COLUMNS)
        .in('round_id', ids)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: AngleShot[] | null; error: { message: string } | null }>,
    );
    if (sErr) throw new Error(`insight-angles shots query failed: ${sErr.message}`);
    shots.push(...(s ?? []));
  }

  let scale = 1;
  const { data: sc, error: scErr } = await sb.rpc('sg_scale_for_player', { p_player_id: playerId });
  if (!scErr && num(sc) !== null && (num(sc) as number) > 0) scale = num(sc) as number;

  const scoringBaseline = await loadPlayerScoringBaseline(playerId);
  return { playerId, rounds, holes, shots, scale, scoringBaseline };
}

/** The player's angle data (memoized; throws on a read error). */
export function loadAngleData(playerId: string): Promise<AngleData> {
  const now = Date.now();
  const hit = playerMemo.get(playerId);
  if (hit && now - hit.at < MEMO_TTL_MS) return hit.value;
  for (const [k, v] of playerMemo) if (now - v.at >= MEMO_TTL_MS) playerMemo.delete(k);
  const value = readAngleData(createAdminClient(), playerId);
  playerMemo.set(playerId, { at: now, value });
  value.catch(() => playerMemo.delete(playerId));
  return value;
}

type PeerRow = CountableRoundInput & {
  player_id: string;
  round_date: string;
  score_to_par: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
};

async function readTeamRounds(sb: Sb, teamId: string): Promise<PeerRound[]> {
  const { data, error } = await fetchAllRowsResult<PeerRow>((from, to) =>
    sb
      .from('golf_rounds')
      .select(
        'player_id, round_date, status, holes_played, total_score, front_nine, back_nine, total_putts, strokes_gained_total, score_to_par, total_fairways_hit, total_fairways',
      )
      .eq('team_id', teamId)
      .eq('status', 'completed')
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: PeerRow[] | null; error: { message: string } | null }>,
  );
  if (error) throw new Error(`insight-angles team rounds query failed: ${error.message}`);
  const out: PeerRound[] = [];
  for (const r of data ?? []) {
    if (!isCountableRound(r)) continue;
    out.push({
      player_id: r.player_id,
      date: String(r.round_date).slice(0, 10),
      holes: r.holes_played ?? 18,
      sg_total: num(r.strokes_gained_total),
      score_to_par: num(r.score_to_par),
      fairways_hit: num(r.total_fairways_hit),
      fairways_total: num(r.total_fairways),
    });
  }
  return out;
}

/** Every countable round on the team (memoized per team; throws on error). */
export function loadTeamPeerRounds(teamId: string): Promise<PeerRound[]> {
  const now = Date.now();
  const hit = teamMemo.get(teamId);
  if (hit && now - hit.at < MEMO_TTL_MS) return hit.value;
  for (const [k, v] of teamMemo) if (now - v.at >= MEMO_TTL_MS) teamMemo.delete(k);
  const value = readTeamRounds(createAdminClient(), teamId);
  teamMemo.set(teamId, { at: now, value });
  value.catch(() => teamMemo.delete(teamId));
  return value;
}

/** Test seam. */
export function clearAngleDataMemo(): void {
  playerMemo.clear();
  teamMemo.clear();
}
