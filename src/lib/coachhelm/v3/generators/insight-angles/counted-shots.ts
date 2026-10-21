/**
 * Slice 5b: the counted shot attempts the new insight-angle families read
 * (par-3 tee shots, SG per approach, lag leave, under-reading), for the
 * player and, the same way, for each teammate in the team pool.
 *
 * PURE: no Supabase. The rows come from `load-angle-data.ts` (the player's
 * {@link AngleData}; the teammates' {@link TeamShotData}).
 *
 * Units (`01` row 26): every distance goes through ONE conversion at this
 * boundary, `yardsOf` / `feetOf` in `angle-data.ts`, with the row's own unit.
 *
 * Per-attempt strokes gained: the `calculate_round_strokes_gained` port
 * (`shot-sg.ts`) at the player's SG scale, summed over the attempt's own row
 * and the penalty rows recorded straight after it (and, for a par-3 tee
 * shot, a re-tee from the tee), so a ball in the water costs the approach
 * that hit it, exactly as the stored round SG charges it. A shot ends where
 * the next non-penalty shot starts (its own recorded finish only when no such
 * shot follows), the endpoint rule of
 * `20260930150000_golf_sg_penalty_charged_to_earning_shot.sql`. Teammates are on
 * the same team, so `sg_scale_for_player` (a team setting) gives them the
 * same scale; the player's scale is used for the pool.
 */
import {
  feetOf,
  holeKey,
  shotSgById,
  yardsOf,
  type AngleData,
  type AngleHole,
  type AngleRound,
  type AngleShot,
} from './angle-data';
import { sgNormalizeLie } from './shot-sg';

/** One teammate's countable rounds (newest {@link PEER_SHOT_ROUND_LIMIT}), holes and shots. */
export interface TeammateShots {
  player_id: string;
  rounds: Pick<AngleRound, 'id' | 'date' | 'holes'>[];
  holes: AngleHole[];
  /**
   * Every shot row of those rounds, whatever its type: the SG port resolves
   * an attempt's endpoint from the row after it (an around-green chip, a
   * re-tee), so filtering types would price a teammate's approach against a
   * later shot than the player's unfiltered read does. Which rows count as an
   * attempt is decided by the extractors, the same for both.
   */
  shots: AngleShot[];
}

/** The teammates of one team, the player excluded. */
export interface TeamShotData {
  teammates: TeammateShots[];
}

/** `03` §5.2: countable rounds a teammate needs to join the pool. */
export const TEAMMATE_MIN_ROUNDS = 3;
/** `02` §3: pooled attempts below which there is no team line. */
export const TEAM_POOL_MIN_ATTEMPTS = 100;

// ---------------------------------------------------------------------------
// Shared record shape
// ---------------------------------------------------------------------------

/** What every extractor reads: one player's rounds, holes and shots, and the SG scale. */
export interface ShotRecord {
  rounds: readonly Pick<AngleRound, 'id' | 'date' | 'holes'>[];
  holes: readonly AngleHole[];
  shots: readonly AngleShot[];
  scale: number | null;
}

export function recordOf(data: AngleData): ShotRecord {
  return { rounds: data.rounds, holes: data.holes, shots: data.shots, scale: data.scale };
}

/** Shots of the record's rounds, grouped by hole and sorted by shot number. */
function holesWithShots(rec: ShotRecord): Map<string, AngleShot[]> {
  const ids = new Set(rec.rounds.map((r) => r.id));
  const out = new Map<string, AngleShot[]>();
  for (const s of rec.shots) {
    if (!ids.has(s.round_id)) continue;
    const k = holeKey(s.round_id, s.hole_number);
    const arr = out.get(k) ?? [];
    arr.push(s);
    out.set(k, arr);
  }
  for (const arr of out.values()) arr.sort((a, b) => a.shot_number - b.shot_number);
  return out;
}

function holeIndex(rec: ShotRecord): Map<string, AngleHole> {
  const m = new Map<string, AngleHole>();
  for (const h of rec.holes) m.set(holeKey(h.round_id, h.hole_number), h);
  return m;
}

function isPenaltyRow(s: AngleShot): boolean {
  return s.is_penalty === true || s.shot_type === 'penalty';
}

function reachedGreen(s: AngleShot): boolean {
  const r = (s.result ?? '').toLowerCase();
  if (r === 'green' || r === 'hole' || r === 'holed' || r === 'gir') return true;
  return (s.lie_after ?? '').toLowerCase() === 'green';
}

/** The short/long part of a recorded approach miss direction; null when it has none. */
export function depthOfMiss(direction: string | null): 'short' | 'long' | null {
  const d = (direction ?? '').toLowerCase();
  if (d.includes('short')) return 'short';
  if (d.includes('long')) return 'long';
  return null;
}

// ---------------------------------------------------------------------------
// Approach attempts (par-3 tee shots and SG per approach)
// ---------------------------------------------------------------------------

export type ApproachBand = '50_125' | '125_175' | '175_plus';
export const APPROACH_BANDS: readonly ApproachBand[] = ['50_125', '125_175', '175_plus'];
export const APPROACH_BAND_LABEL: Record<ApproachBand, string> = {
  '50_125': '50–125 yd',
  '125_175': '125–175 yd',
  '175_plus': '175+ yd',
};

/** The approach-band rule of `bucketApproachDistance` (yards, the row's own unit). */
export function approachBandOf(yards: number): ApproachBand | null {
  if (yards >= 50 && yards < 125) return '50_125';
  if (yards >= 125 && yards < 175) return '125_175';
  if (yards >= 175) return '175_plus';
  return null;
}

/** Par-3 tee-shot length bands (`docs/v3-research-golf-domain.md` §Par-3 Length Tiers). */
export type Par3Band = 'lt150' | '150_175' | '175_plus';
export const PAR3_BANDS: readonly Par3Band[] = ['lt150', '150_175', '175_plus'];
export const PAR3_BAND_LABEL: Record<Par3Band, string> = {
  lt150: 'under 150 yd',
  '150_175': '150–175 yd',
  '175_plus': '175+ yd',
};
export function par3BandOf(yards: number): Par3Band {
  if (yards < 150) return 'lt150';
  if (yards < 175) return '150_175';
  return '175_plus';
}

export interface ApproachAttempt {
  round_id: string;
  hole_number: number;
  hole_id: string | null;
  date: string;
  par: number | null;
  yards: number;
  /** Strokes gained for the attempt (its row plus the penalty rows after it). */
  sg: number;
  green: boolean;
  /** Short/long part of the miss; null when it hit the green or no depth was recorded. */
  depth: 'short' | 'long' | null;
  /** On-green finish in feet when it hit the green; null otherwise. */
  proximity_ft: number | null;
}

export interface ApproachExtract {
  /** Approaches (`shot_type='approach'`, not from the tee) by band. */
  bands: Record<ApproachBand, ApproachAttempt[]>;
  /** First shots on par-3 holes (from the tee). */
  par3: ApproachAttempt[];
  excluded: {
    /** Approaches from the tee (par-3 tee shots and re-tees): never in a band. */
    tee_approaches: number;
    /** Approaches inside 50 yd or with no start distance. */
    no_band: number;
    /** Attempts the SG port could not price (no hole row, no start distance). */
    no_sg: number;
    /** Par-3 holes whose first recorded shot is not from the tee. */
    par3_first_not_tee: number;
  };
}

function onGreenFeet(s: AngleShot): number | null {
  if (!reachedGreen(s)) return null;
  // On-green finishes are stored in feet; only an explicit 'yards' row is scaled.
  const ft = s.distance_unit_after === 'yards' ? feetOf(s.distance_to_hole_after, 'yards') : feetOf(s.distance_to_hole_after, 'feet');
  return ft !== null && ft >= 0 ? ft : null;
}

/**
 * Every approach attempt and par-3 tee shot in the record, with its SG.
 * Without an SG scale there is no per-shot SG, so both lists are empty and
 * the families that read them say nothing.
 */
export function extractApproaches(rec: ShotRecord): ApproachExtract {
  const out: ApproachExtract = {
    bands: { '50_125': [], '125_175': [], '175_plus': [] },
    par3: [],
    excluded: { tee_approaches: 0, no_band: 0, no_sg: 0, par3_first_not_tee: 0 },
  };
  if (rec.scale === null) return out;
  // Next-shot-start endpoint, as the stored round SG of
  // 20260930150000_golf_sg_penalty_charged_to_earning_shot.sql prices it.
  const sg = shotSgById(
    { shots: rec.shots as AngleShot[], holes: rec.holes as AngleHole[], scale: rec.scale },
    { endpoint: 'next_shot_start' },
  );
  const dateOf = new Map(rec.rounds.map((r) => [r.id, r.date]));
  const holes = holeIndex(rec);
  for (const [key, list] of holesWithShots(rec)) {
    const hole = holes.get(key) ?? null;
    const par = hole?.par ?? null;
    const sumFrom = (i: number, alsoTee: boolean): number | null => {
      const own = sg.get(list[i]!.id);
      if (own === undefined) return null;
      let total = own;
      for (let j = i + 1; j < list.length; j++) {
        const next = list[j]!;
        const reTee = alsoTee && next.shot_type !== 'putting' && sgNormalizeLie(next.lie_before) === 'tee';
        if (!isPenaltyRow(next) && !reTee) break;
        total += sg.get(next.id) ?? 0;
      }
      return total;
    };
    const attemptOf = (i: number, alsoTee: boolean): ApproachAttempt | null => {
      const s = list[i]!;
      const yards = yardsOf(s.distance_to_hole_before, s.distance_unit_before);
      const v = sumFrom(i, alsoTee);
      if (yards === null || !(yards > 0) || v === null) {
        out.excluded.no_sg += 1;
        return null;
      }
      const green = reachedGreen(s);
      return {
        round_id: s.round_id,
        hole_number: s.hole_number ?? -1,
        hole_id: hole?.id ?? s.hole_id,
        date: dateOf.get(s.round_id) ?? '',
        par,
        yards,
        sg: v,
        green,
        depth: green ? null : depthOfMiss(s.miss_direction),
        proximity_ft: onGreenFeet(s),
      };
    };

    // Par-3 tee shot: the hole's first recorded shot, from the tee.
    if (par === 3 && list.length > 0) {
      const first = list[0]!;
      if (first.shot_type !== 'putting' && sgNormalizeLie(first.lie_before) === 'tee') {
        const a = attemptOf(0, true);
        if (a) out.par3.push(a);
      } else {
        out.excluded.par3_first_not_tee += 1;
      }
    }

    list.forEach((s, i) => {
      if (s.shot_type !== 'approach') return;
      if (sgNormalizeLie(s.lie_before) === 'tee') {
        out.excluded.tee_approaches += 1;
        return;
      }
      const yards = yardsOf(s.distance_to_hole_before, s.distance_unit_before);
      const band = yards === null ? null : approachBandOf(yards);
      if (!band) {
        out.excluded.no_band += 1;
        return;
      }
      const a = attemptOf(i, false);
      if (a) out.bands[band].push(a);
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Putting: lag leave and breaking-putt miss sides
// ---------------------------------------------------------------------------

/** A lag putt starts this far or farther (`04` example 1). */
export const LAG_FROM_FT = 30;
/** A lag that finishes this close or closer (or holes) is a good leave (`04` example 1). */
export const LAG_INSIDE_FT = 5;

export interface LagPutt {
  round_id: string;
  hole_number: number;
  hole_id: string | null;
  date: string;
  first_ft: number;
  /** Second putt's recorded start (ft); 0 when the first putt holed. */
  leave_ft: number;
  inside: boolean;
  /** The hole took 3 or more putts. */
  three_putt: boolean;
}

export interface BreakingMiss {
  round_id: string;
  hole_number: number;
  hole_id: string | null;
  date: string;
  brk: 'left_to_right' | 'right_to_left';
  ft: number | null;
  side: 'low' | 'high' | null;
}

export interface PuttExtract {
  lag: LagPutt[];
  breaking_misses: BreakingMiss[];
  excluded: {
    /** Holes whose putting rows are out of order or fewer than `golf_holes.putts`. */
    putt_rows_incomplete: number;
    /** Lag putts (30+ ft) that missed with no recorded second-putt distance. */
    lag_leave_missing: number;
  };
}

function puttFeet(s: AngleShot): number | null {
  const ft = s.putt_distance_feet ?? feetOf(s.distance_to_hole_before, s.distance_unit_before);
  return ft !== null && ft > 0 ? ft : null;
}

/** The side part of a putt miss tag (`low`, `high_long`, ...); null when it names no side. */
export function sideOfMiss(direction: string | null): 'low' | 'high' | null {
  const d = (direction ?? '').toLowerCase();
  if (d.includes('low')) return 'low';
  if (d.includes('high')) return 'high';
  return null;
}

/**
 * Lag putts and breaking-putt misses in the record. A hole's putting rows
 * must be contiguous and at least `golf_holes.putts` long, as in the
 * three-putt chain; other holes are left out and counted.
 */
export function extractPutts(rec: ShotRecord): PuttExtract {
  const out: PuttExtract = { lag: [], breaking_misses: [], excluded: { putt_rows_incomplete: 0, lag_leave_missing: 0 } };
  const dateOf = new Map(rec.rounds.map((r) => [r.id, r.date]));
  const holes = holeIndex(rec);
  for (const [key, list] of holesWithShots(rec)) {
    const putts = list.filter((s) => s.shot_type === 'putting');
    if (putts.length === 0) continue;
    const first = putts[0]!;
    const hole = holes.get(key) ?? null;
    const recorded = hole?.putts != null && hole.putts > 0 ? hole.putts : null;
    const contiguous = putts.every((p, i) => p.shot_number === first.shot_number + i);
    if (!contiguous || (recorded !== null && putts.length < recorded)) {
      out.excluded.putt_rows_incomplete += 1;
      continue;
    }
    const n = recorded ?? putts.length;
    const base = {
      round_id: first.round_id,
      hole_number: first.hole_number ?? -1,
      hole_id: hole?.id ?? first.hole_id,
      date: dateOf.get(first.round_id) ?? '',
    };
    const firstFt = puttFeet(first);
    if (firstFt !== null && firstFt >= LAG_FROM_FT) {
      if (n <= 1) {
        out.lag.push({ ...base, first_ft: firstFt, leave_ft: 0, inside: true, three_putt: false });
      } else {
        const leave = putts[1] ? puttFeet(putts[1]) : null;
        if (leave === null) out.excluded.lag_leave_missing += 1;
        else out.lag.push({ ...base, first_ft: firstFt, leave_ft: leave, inside: leave <= LAG_INSIDE_FT, three_putt: n >= 3 });
      }
    }
    putts.forEach((p, i) => {
      const brk = p.putt_break;
      if (brk !== 'left_to_right' && brk !== 'right_to_left') return;
      const holed = p.putt_made === true || p.result === 'holed' || p.result === 'hole';
      // The last putt on a hole is the one that dropped, whatever its flag says.
      const missed = !holed && (p.putt_made === false || i < putts.length - 1);
      if (!missed) return;
      out.breaking_misses.push({ ...base, brk, ft: puttFeet(p), side: sideOfMiss(p.miss_direction) });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Team pool
// ---------------------------------------------------------------------------

/**
 * Teammates who can join a pool: {@link TEAMMATE_MIN_ROUNDS}+ countable
 * rounds, the player never among them.
 */
export function poolTeammates(team: TeamShotData | null, playerId: string): TeammateShots[] {
  if (!team) return [];
  return team.teammates.filter((t) => t.player_id !== playerId && t.rounds.length >= TEAMMATE_MIN_ROUNDS);
}
