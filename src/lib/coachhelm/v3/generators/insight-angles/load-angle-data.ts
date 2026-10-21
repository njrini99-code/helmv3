/**
 * DB side of the CoachHelm v3 insight angles (`angle-data.ts` is pure).
 *
 * {@link createAngleLoaders} returns the reads for ONE
 * `insightAngleGenerators(playerId)` call: each read is lazy and runs at most
 * once per call, shared by that call's five generators, and nothing is cached
 * across calls (a later run always reads fresh rows).
 *
 * - The player: the newest {@link ANGLE_ROUND_LIMIT} COUNTABLE completed
 *   rounds (`isCountableRound`, the same rule as the root map and every other
 *   player-facing number), their holes and every recorded shot, plus
 *   `sg_scale_for_player` and the scoring baseline. Rounds are over-fetched
 *   so non-countable ones do not shrink the window; holes and shots are read
 *   in id chunks with pagination (PostgREST 1,000-row cap).
 * - A team: `golf_rounds` rows only (per-round score to par, SG, fairways and
 *   the cached three-putt count), never another player's shots.
 * - The Tour three-putt figure for the player's tour (`golf_pga_standards`).
 */
import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';
import { loadPlayerScoringBaseline } from '@/lib/coachhelm/v3/counterfactual/baseline-loader';
import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';
import { logServerError } from '@/lib/server-error-logger';
import {
  ANGLE_ROUND_LIMIT,
  type AngleData,
  type AngleHole,
  type AngleRound,
  type AngleShot,
  type PeerRound,
  type TourThreePutt,
} from './angle-data';
import type { AngleLoaders } from './angle-generator';

const IN_CHUNK = 60;

/** `golf_pga_standards.metric_id` of a Tour three-putts-per-18 figure (none stored as of 2026-10-20). */
export const TOUR_THREE_PUTT_METRIC = 'three_putts_per_18';

const ROUND_COLUMNS =
  'id, round_date, team_id, status, is_test, holes_played, total_score, front_nine, back_nine, total_putts, ' +
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
    // Test rounds (QA/demo data) never count (02 §7 recheck row; isCountableRound re-checks).
    .eq('is_test', false)
    .order('round_date', { ascending: false })
    // Tiebreak so two rounds on one date always come back in the same order.
    .order('id', { ascending: false })
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

  // No fallback to a scale of 1: without the player's own scale the SG-based
  // families say nothing (`AngleData.scale` null).
  let scale: number | null = null;
  const { data: sc, error: scErr } = await sb.rpc('sg_scale_for_player', { p_player_id: playerId });
  if (scErr) {
    await logServerError(`insight-angles sg_scale_for_player failed for player=${playerId}: ${scErr.message}`, {
      action: 'v3.angles.load.sg_scale',
    });
  } else if (num(sc) !== null && (num(sc) as number) > 0) {
    scale = num(sc) as number;
  }

  const scoringBaseline = await loadPlayerScoringBaseline(playerId);
  return { playerId, rounds, holes, shots, scale, scoringBaseline };
}

type PeerRow = CountableRoundInput & {
  id: string;
  player_id: string;
  course_id: string | null;
  round_date: string;
  score_to_par: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  golf_round_stats_cache: { three_putts: number | null } | { three_putts: number | null }[] | null;
};

function cachedThreePutts(v: PeerRow['golf_round_stats_cache']): number | null {
  const row = Array.isArray(v) ? v[0] : v;
  return row ? num(row.three_putts) : null;
}

async function readTeamRounds(sb: Sb, teamId: string): Promise<PeerRound[]> {
  const { data, error } = await fetchAllRowsResult<PeerRow>((from, to) =>
    sb
      .from('golf_rounds')
      .select(
        'id, player_id, course_id, round_date, status, is_test, holes_played, total_score, front_nine, back_nine, total_putts, strokes_gained_total, score_to_par, total_fairways_hit, total_fairways, golf_round_stats_cache(three_putts)',
      )
      .eq('team_id', teamId)
      .eq('status', 'completed')
      .eq('is_test', false)
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: PeerRow[] | null; error: { message: string } | null }>,
  );
  if (error) throw new Error(`insight-angles team rounds query failed: ${error.message}`);
  const out: PeerRound[] = [];
  for (const r of data ?? []) {
    if (!isCountableRound(r)) continue;
    out.push({
      round_id: r.id,
      player_id: r.player_id,
      course_id: r.course_id ?? null,
      date: String(r.round_date).slice(0, 10),
      holes: r.holes_played ?? 18,
      sg_total: num(r.strokes_gained_total),
      score_to_par: num(r.score_to_par),
      fairways_hit: num(r.total_fairways_hit),
      fairways_total: num(r.total_fairways),
      three_putts: cachedThreePutts(r.golf_round_stats_cache),
    });
  }
  return out;
}

async function readTourThreePutt(sb: Sb, playerId: string): Promise<TourThreePutt | null> {
  const cohort = await loadPlayerCohort(playerId);
  if (cohort.failed) return null;
  const tour = cohort.gender === 'womens' ? 'lpga' : 'pga';
  const { data, error } = await sb
    .from('golf_pga_standards')
    .select('pga_tour_value, season, source')
    .eq('metric_id', TOUR_THREE_PUTT_METRIC)
    .eq('tour', tour)
    .order('season', { ascending: false })
    .limit(1);
  if (error) throw new Error(`insight-angles Tour three-putt query failed: ${error.message}`);
  const row = (data ?? [])[0] as { pga_tour_value: unknown; season: string; source: string | null } | undefined;
  const v = row ? num(row.pga_tour_value) : null;
  if (!row || v === null || !(v > 0)) return null;
  return { per_18: v, tour, season: row.season, source: row.source ?? `${tour.toUpperCase()} ${row.season}` };
}

/**
 * The reads for one `insightAngleGenerators(playerId)` call: lazy, at most
 * once each per call (per team for the team read), never cached across
 * calls. A rejected read rejects every generator that asked for it.
 */
export function createAngleLoaders(playerId: string): AngleLoaders {
  let sb: Sb | null = null;
  const client = (): Sb => (sb ??= createAdminClient());
  let data: Promise<AngleData> | null = null;
  let tour: Promise<TourThreePutt | null> | null = null;
  const teams = new Map<string, Promise<PeerRound[]>>();
  return {
    data: () => (data ??= readAngleData(client(), playerId)),
    teamRounds: (teamId) => {
      let p = teams.get(teamId);
      if (!p) {
        p = readTeamRounds(client(), teamId);
        teams.set(teamId, p);
      }
      return p;
    },
    tourThreePutt: () => (tour ??= readTourThreePutt(client(), playerId)),
  };
}
