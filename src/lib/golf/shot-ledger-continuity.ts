/**
 * Shot-ledger continuity check (audit row 46).
 *
 * Per-shot strokes gained is E(before) - 1 - E(after), so when one shot's
 * `lie_after` / `distance_to_hole_after` disagrees with the next shot's
 * `lie_before` / `distance_to_hole_before`, the two shots' SG no longer sum
 * to the hole: the difference silently lands on neither. Prod had 4.5% of
 * shot-to-shot lies and 0.1% of distances not chaining.
 *
 * This only FLAGS. It never rejects a save: a golfer's scorecard is the
 * record, and a lie label mismatch is a data-quality signal for review, not a
 * reason to lose a round.
 *
 * Deliberately NOT flagged:
 * - penalty strokes (`is_penalty` / lie_after 'penalty'): a drop legitimately
 *   restarts the chain at a new lie and distance;
 * - an unknown `lie_after` (null): nothing to compare;
 * - rough -> 'other': the logger records a recovery lie (trees, pine straw)
 *   as 'other' on the next shot while the landing was called rough (1,015
 *   such pairs in prod, all plausible).
 */

export interface ContinuityShot {
  shot_number: number;
  lie_before: string | null;
  lie_after: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  is_penalty: boolean | null;
}

export interface ShotChainDiscontinuity {
  hole_number: number;
  /** The earlier shot of the pair that does not chain. */
  shot_number: number;
  kind: 'lie' | 'distance';
  after: string | number;
  next_before: string | number;
}

const COMPATIBLE_LIES: ReadonlyArray<readonly [string, string]> = [['rough', 'other']];

function liesChain(after: string, nextBefore: string): boolean {
  if (after === nextBefore) return true;
  return COMPATIBLE_LIES.some(([a, b]) => a === after && b === nextBefore);
}

function toFeet(value: number, unit: string | null): number {
  return unit === 'feet' ? value : value * 3;
}

/** Tolerance: 3 ft, or 5% of the distance, whichever is larger. */
function distancesChain(afterFt: number, nextBeforeFt: number): boolean {
  const tolerance = Math.max(3, 0.05 * Math.max(afterFt, nextBeforeFt));
  return Math.abs(afterFt - nextBeforeFt) <= tolerance;
}

export function findShotChainDiscontinuities(
  groups: ReadonlyArray<{ hole_number: number; shots: ReadonlyArray<ContinuityShot> }>,
): ShotChainDiscontinuity[] {
  const out: ShotChainDiscontinuity[] = [];
  for (const group of groups) {
    const shots = [...group.shots].sort((a, b) => a.shot_number - b.shot_number);
    for (let i = 0; i + 1 < shots.length; i++) {
      const cur = shots[i];
      const next = shots[i + 1];
      if (!cur || !next) continue;
      if (cur.is_penalty || cur.lie_after === 'penalty') continue;

      if (cur.lie_after && next.lie_before && !liesChain(cur.lie_after, next.lie_before)) {
        out.push({
          hole_number: group.hole_number,
          shot_number: cur.shot_number,
          kind: 'lie',
          after: cur.lie_after,
          next_before: next.lie_before,
        });
        continue;
      }

      if (cur.distance_to_hole_after != null && next.distance_to_hole_before != null) {
        const afterFt = toFeet(cur.distance_to_hole_after, cur.distance_unit_after);
        const nextFt = toFeet(next.distance_to_hole_before, next.distance_unit_before);
        if (!distancesChain(afterFt, nextFt)) {
          out.push({
            hole_number: group.hole_number,
            shot_number: cur.shot_number,
            kind: 'distance',
            after: cur.distance_to_hole_after,
            next_before: next.distance_to_hole_before,
          });
        }
      }
    }
  }
  return out;
}
