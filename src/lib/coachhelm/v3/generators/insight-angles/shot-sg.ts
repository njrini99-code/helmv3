/**
 * Per-shot strokes gained for the insight angles.
 *
 * {@link shotSgForRound} is a line-for-line port of the DB function
 * `calculate_round_strokes_gained(uuid)` (category rules, the LEAD() fallback
 * for a missing finish, lie normalisation, penalty = -1), with expected
 * strokes from `getExpectedStrokes` (kept in sync with
 * `public.sg_expected_strokes()`). Ported from PR #2073's
 * `root-map/approach-context.ts` (only the per-shot part; the root map itself
 * is not on main). Calibrated there on three players: recomputed and stored
 * per-round approach SG agreed to the second decimal.
 *
 * PURE: no Supabase, no React.
 */
import { getExpectedStrokes } from '@/lib/utils/golf-stats-calculator-shots';

/** One `golf_shots` row as the angle loader reads it. */
export interface RawShotRow {
  id: string;
  round_id: string;
  hole_id: string | null;
  hole_number: number | null;
  shot_number: number;
  shot_type: string | null;
  club_type: string | null;
  lie_before: string | null;
  lie_after: string | null;
  result: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  is_penalty: boolean | null;
  putt_made: boolean | null;
  miss_direction: string | null;
  created_at: string | null;
  /** Recovery tap: the player marked this shot's finish as blocked. */
  lie_after_recovery?: boolean | null;
}

/**
 * Which `public.sg_normalize_lie` body to port.
 * - `live`: today's body, 'other' falls to fairway.
 * - `held`: the body of held `20261023170000_golf_sg_other_lie_curve.sql`,
 *   which keeps 'other' and 'recovery' (both priced by `getExpectedStrokes`).
 */
export type SgLieCurve = 'live' | 'held';

/** `public.sg_normalize_lie`. */
export function sgNormalizeLie(lie: string | null, curve: SgLieCurve = 'live'): string {
  const key = (lie ?? 'fairway').toLowerCase();
  if (curve === 'held' && (key === 'other' || key === 'recovery')) return key;
  switch (key) {
    case 'tee':
    case 'teebox':
      return 'tee';
    case 'fairway':
      return 'fairway';
    case 'rough':
    case 'primary_rough':
      return 'rough';
    case 'sand':
    case 'bunker':
    case 'greenside_bunker':
    case 'fairway_bunker':
      return 'sand';
    case 'green':
    case 'fringe':
      return 'green';
    default:
      return 'fairway';
  }
}

function yardsOf(d: number | null, unit: string | null): number | null {
  if (d === null || !Number.isFinite(Number(d))) return null;
  return unit === 'feet' ? Number(d) / 3 : Number(d);
}

function expected(lie: string, yards: number, scale: number): number {
  if (yards <= 0) return 0;
  return lie === 'green' ? getExpectedStrokes('green', yards, yards * 3, scale) : getExpectedStrokes(lie, yards, undefined, scale);
}

/**
 * Where a non-holed shot ends.
 *
 * - `own_finish` (default): its own recorded finish, else the next eligible
 *   shot's start: the live `calculate_round_strokes_gained` body.
 * - `next_shot_start`: the start of the next NON-PENALTY shot on the hole
 *   (shot_number after it, positive start distance, a lie or a putt), else its
 *   own recorded finish: the endpoint rule of
 *   `20260930150000_golf_sg_penalty_charged_to_earning_shot.sql` (its `nx`
 *   lateral), so each hole telescopes. Only the counted families
 *   (`counted-shots.ts`) use it. It also ports the held
 *   `20261023170000_golf_sg_other_lie_curve.sql`, which rewrites those same
 *   Q-89 bodies and is applied right after them: 'other' keeps its own curve,
 *   and the recovery tap (`lie_after_recovery`) prices the shot after a
 *   blocked one from 'recovery' and ends the blocked shot there (see
 *   {@link isFromBlocked}).
 */
export type ShotEndpoint = 'own_finish' | 'next_shot_start';

export interface ShotSgOptions {
  endpoint?: ShotEndpoint;
}

/** The migration's `nx`: the next non-penalty shot on the hole with a start. */
function nextShotStart(holeShots: readonly RawShotRow[], s: RawShotRow): RawShotRow | null {
  let best: RawShotRow | null = null;
  for (const n of holeShots) {
    if (n.shot_number <= s.shot_number || n.is_penalty === true) continue;
    if (n.distance_to_hole_before === null || !(Number(n.distance_to_hole_before) > 0)) continue;
    if (n.lie_before === null && n.shot_type !== 'putting') continue;
    if (!best || n.shot_number < best.shot_number || (n.shot_number === best.shot_number && n.id < best.id)) best = n;
  }
  return best;
}

/** A penalty row between `from` and `to` on the hole (`rc` / end rule of 20261023170000). */
function penaltyBetween(holeShots: readonly RawShotRow[], from: RawShotRow, to: RawShotRow): boolean {
  return holeShots.some((m) => m.is_penalty === true && m.shot_number > from.shot_number && m.shot_number < to.shot_number);
}

/** A shot the next shot can start from (the `nx` lateral's conditions). */
function isUsableStart(n: RawShotRow): boolean {
  if (n.is_penalty === true) return false;
  if (n.distance_to_hole_before === null || !(Number(n.distance_to_hole_before) > 0)) return false;
  return n.lie_before !== null || n.shot_type === 'putting';
}

/**
 * 20261023170000's `rc.from_blocked`: `s` is the next shot of a non-penalty
 * shot the player marked blocked, with no usable shot and no penalty row
 * (a drop moves the ball) in between.
 */
function isFromBlocked(holeShots: readonly RawShotRow[], s: RawShotRow): boolean {
  if (!isUsableStart(s)) return false;
  return holeShots.some((p) => p.shot_number < s.shot_number
    && p.lie_after_recovery === true && p.is_penalty !== true
    && !holeShots.some((m) => m.shot_number > p.shot_number && m.shot_number < s.shot_number
      && (m.is_penalty === true || isUsableStart(m))));
}

const RECOVERY_TAP_LIES: ReadonlySet<string> = new Set(['rough', 'other']);

export interface ShotSg {
  shotId: string;
  category: 'off_tee' | 'approach' | 'around_green' | 'putting';
  sg: number;
}

/**
 * Per-shot SG for one round, as `calculate_round_strokes_gained` computes it.
 * Shots without a `hole_id`, a `shot_type` or a positive start distance are
 * skipped, exactly as the DB query's join and WHERE do; a shot with no
 * resolvable finish contributes nothing (`has_after`).
 */
export function shotSgForRound(
  shots: readonly RawShotRow[],
  parByHoleId: ReadonlyMap<string, number>,
  scale: number,
  opts: ShotSgOptions = {},
): ShotSg[] {
  const nextStart = opts.endpoint === 'next_shot_start';
  const allByHole = new Map<string, RawShotRow[]>();
  if (nextStart) {
    for (const s of shots) {
      if (!s.hole_id) continue;
      const arr = allByHole.get(s.hole_id) ?? [];
      arr.push(s);
      allByHole.set(s.hole_id, arr);
    }
  }
  const eligible = shots.filter((s) => {
    if (!s.hole_id || !parByHoleId.has(s.hole_id) || !s.shot_type) return false;
    const d = yardsOf(s.distance_to_hole_before, s.distance_unit_before);
    return d !== null && d > 0;
  });
  const byHole = new Map<string, RawShotRow[]>();
  for (const s of eligible) {
    const arr = byHole.get(s.hole_id!) ?? [];
    arr.push(s);
    byHole.set(s.hole_id!, arr);
  }
  const out: ShotSg[] = [];
  for (const [holeId, list] of byHole) {
    const par = parByHoleId.get(holeId)!;
    const sorted = [...list].sort((a, b) => a.shot_number - b.shot_number);
    sorted.forEach((s, i) => {
      const next = sorted[i + 1];
      const pen = s.is_penalty === true;
      const curve: SgLieCurve = nextStart ? 'held' : 'live';
      const holeAll = allByHole.get(holeId) ?? [];
      let lb = s.shot_type === 'putting' ? 'green' : sgNormalizeLie(s.lie_before, curve);
      if (nextStart && !pen && RECOVERY_TAP_LIES.has(lb) && isFromBlocked(holeAll, s)) lb = 'recovery';
      const blocked = nextStart && !pen && s.lie_after_recovery === true;
      const db = yardsOf(s.distance_to_hole_before, s.distance_unit_before)!;
      const holed = s.putt_made === true || s.result === 'holed' || s.result === 'hole';
      let da: number;
      let la: string;
      const nx = nextStart && !holed ? nextShotStart(holeAll, s) : null;
      if (holed) {
        da = 0;
        la = 'green';
      } else if (nx) {
        da = yardsOf(nx.distance_to_hole_before, nx.distance_unit_before) ?? 0;
        la = nx.shot_type === 'putting' ? 'green' : sgNormalizeLie(nx.lie_before, curve);
        if (blocked && nx.shot_type !== 'putting' && RECOVERY_TAP_LIES.has(la) && !penaltyBetween(holeAll, s, nx)) la = 'recovery';
      } else if (nextStart) {
        da = s.distance_to_hole_after !== null ? (yardsOf(s.distance_to_hole_after, s.distance_unit_after) ?? 0) : 0;
        la = sgNormalizeLie(s.lie_after, curve);
        if (blocked && s.lie_after !== null && RECOVERY_TAP_LIES.has(la)) la = 'recovery';
      } else {
        if (s.distance_to_hole_after !== null) da = yardsOf(s.distance_to_hole_after, s.distance_unit_after) ?? 0;
        else da = next ? (yardsOf(next.distance_to_hole_before, next.distance_unit_before) ?? 0) : 0;
        la = s.lie_after !== null ? sgNormalizeLie(s.lie_after) : sgNormalizeLie(next?.lie_before ?? null);
      }

      let category: ShotSg['category'];
      if (pen) {
        category = lb === 'tee' ? (par === 3 ? 'approach' : 'off_tee') : lb === 'green' ? 'around_green' : db <= 50 ? 'around_green' : 'approach';
      } else if (s.shot_type === 'putting') category = 'putting';
      else if (s.shot_type === 'tee') category = 'off_tee';
      else if (s.shot_type === 'around_green') category = 'around_green';
      else category = 'approach';

      const hasAfter = pen || holed || da > 0;
      if (!hasAfter) return;
      const before = pen ? 0 : expected(lb, db, scale);
      const after = pen || holed ? 0 : da > 0 ? expected(la, da, scale) : 0;
      out.push({ shotId: s.id, category, sg: before - after - 1 });
    });
  }
  return out;
}
