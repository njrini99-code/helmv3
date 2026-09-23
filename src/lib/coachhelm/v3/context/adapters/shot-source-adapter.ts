/**
 * Additive adapter (addendum §13, A1 slice 2): `engine/shot-source.ts`'s
 * `ApproachShot` (the row shape the already-shipped `approach-miss.ts`
 * generator already loads and aggregates) → the pure-core `ShotFact`.
 *
 * This does NOT change `shot-source.ts`, `approach-miss.ts`, or any
 * generator output — it is read-only glue over an already-loaded
 * `ApproachShot[]`, used today only by
 * `shot-source-adapter.test.ts`'s before/after comparison. Wiring a real
 * generator onto `ShotFact`-based aggregation is a later slice.
 *
 * `ApproachShot` is a NARROWER row than `golf_shots` itself —
 * `loadApproachShots` never selects `club_type`, `putt_made`, or
 * `created_at`, because `approach-miss.ts` never needed them. The adapter
 * cannot invent what was never queried:
 *
 *   - `club_type`   → always `null` ("not recorded"), same as
 *                     `normalizeClubType`'s own not-recorded case — never
 *                     guessed as `'non_driver'` just because these are
 *                     approach shots.
 *   - `intent`      → always `'unknown'` via `normalizeShot` — `ApproachShot`
 *                     carries no ingest-tagged intent column, matching
 *                     `ShotIntent`'s documented "no backing column today".
 *   - `putt_made`   → always `null` — an approach shot is never itself the
 *                     putt that holes out.
 *   - `shot_type`   → hardcoded `'approach'`. `loadApproachShots` already
 *                     filters `.eq('shot_type', 'approach')`, so every row
 *                     it returns IS one; there's no raw column to lose.
 *   - `miss_direction` → carried through UNCHANGED — `ApproachShot` already
 *                     selects this column, so it's the one field here that
 *                     ISN'T narrowed. Feeds `metrics/distance-profile.ts`'s
 *                     direction-coverage metric (A2).
 *   - `observed_at` → `ApproachShot` has no timestamp at all. A caller that
 *                     needs a real, cutoff-checkable one must use
 *                     `load-player-context.ts` instead, which selects
 *                     `created_at` directly from `golf_shots`. This adapter
 *                     is for the STATIC totals comparison only, so the
 *                     caller supplies `fallbackObservedAt` purely so the
 *                     resulting `ShotFact` type-checks — it carries no
 *                     information the comparison test reads.
 */
import type { ApproachShot } from '../../engine/shot-source';
import { normalizeShot, type RawShotInput } from '../normalize-shot';
import type { ShotFact } from '../types';

export function approachShotToShotFact(
  shot: ApproachShot,
  fallbackObservedAt: string,
): ShotFact {
  const raw: RawShotInput = {
    round_id: shot.round_id,
    hole_number: shot.hole_number,
    shot_number: shot.shot_number,
    shot_type: 'approach',
    club_type: null,
    distance_to_hole_before: shot.distance_to_hole_before,
    distance_unit_before: shot.distance_unit_before,
    distance_to_hole_after: shot.distance_to_hole_after,
    distance_unit_after: shot.distance_unit_after,
    lie_before: shot.lie_before,
    lie_after: shot.lie_after,
    result: shot.result,
    is_penalty: shot.is_penalty,
    putt_made: null,
    miss_direction: shot.miss_direction,
    observed_at: fallbackObservedAt,
  };
  return normalizeShot(raw);
}
