/**
 * Pure shot normalization (addendum §13, A1).
 *
 * `golf_shots` records distance in whichever unit the writer used —
 * `distance_unit_before`/`distance_unit_after` are INDEPENDENT columns on
 * the same row (`engine/shot-source.ts`'s `ApproachShot`), and production
 * data mixes feet and yards: 6,800 of 6,801 approach shots record yards
 * and exactly one records feet (128 ft, i.e. 43 yd — under the 50-yd
 * approach floor). Assuming a shared or default unit is exactly the bug
 * class this module exists to close; every value here is converted using
 * its OWN recorded unit, never its sibling's.
 */

import type { ClubType, ShotFact, ShotIntent, ShotType } from './types';

/** The five value shapes a raw shot/tool field can be tagged with. */
export type ShotValueUnit = 'feet' | 'yards' | 'percent' | 'count' | 'strokes';

/** Canonical unit a normalized value is expressed in — feet/yards both
 *  canonicalize to feet; the other three pass through unchanged. */
export type CanonicalUnit = 'feet' | 'percent' | 'count' | 'strokes';

const FEET_PER_YARD = 3;

/**
 * Why a value came back `missing` rather than a number. Kept explicit
 * (rather than collapsing everything to `null`) because "no value was
 * recorded" and "a value was recorded but its unit can't be trusted" are
 * different data-quality problems with different fixes.
 */
export type MissingReason = 'no_value' | 'not_finite' | 'no_unit' | 'unrecognized_unit';

/**
 * The result of normalizing one raw numeric field. A discriminated union
 * on purpose: callers must branch on `kind` before touching `value`, which
 * is what makes zero and missing impossible to confuse by accident (the
 * classic `if (!value)` bug folds `0` and `null`/`undefined` together —
 * this type has no falsy `value` to test in the first place until you've
 * already confirmed `kind === 'value'`).
 */
export type NormalizedShotValue =
  | { readonly kind: 'value'; readonly value: number; readonly unit: CanonicalUnit }
  | { readonly kind: 'missing'; readonly reason: MissingReason };

/**
 * Normalize one raw `(value, unit)` pair. `feet`/`yards` convert to feet;
 * `percent`/`count`/`strokes` are already canonical and pass through after
 * validation. A real, recorded `0` (e.g. the ball is already at the hole)
 * returns `{ kind: 'value', value: 0, ... }` — it is never treated as
 * missing.
 */
export function normalizeShotValue(
  value: number | null | undefined,
  unit: ShotValueUnit | string | null | undefined,
): NormalizedShotValue {
  if (value === null || value === undefined) return { kind: 'missing', reason: 'no_value' };
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { kind: 'missing', reason: 'not_finite' };
  }
  if (unit === null || unit === undefined || unit === '') {
    return { kind: 'missing', reason: 'no_unit' };
  }
  switch (unit) {
    case 'feet':
      return { kind: 'value', value, unit: 'feet' };
    case 'yards':
      return { kind: 'value', value: value * FEET_PER_YARD, unit: 'feet' };
    case 'percent':
      return { kind: 'value', value, unit: 'percent' };
    case 'count':
      return { kind: 'value', value, unit: 'count' };
    case 'strokes':
      return { kind: 'value', value, unit: 'strokes' };
    default:
      return { kind: 'missing', reason: 'unrecognized_unit' };
  }
}

/** Reads a `NormalizedShotValue` down to the flat `number | null` shape
 *  `ShotFact` carries. The discriminated reason is still available to
 *  anyone who calls `normalizeShotValue` directly (tests, future callers
 *  that need to say WHY a value is missing) — this is the lossy, but far
 *  more common, "just give me the number" read. */
function toFeetOrNull(result: NormalizedShotValue): number | null {
  return result.kind === 'value' ? result.value : null;
}

function normalizeShotType(raw: string | null | undefined): ShotType {
  switch (raw) {
    case 'tee':
    case 'approach':
    case 'around_green':
    case 'putting':
      return raw;
    default:
      return 'unknown';
  }
}

function normalizeClubType(raw: string | null | undefined): ClubType {
  switch (raw) {
    case 'driver':
    case 'non_driver':
    case 'putter':
      return raw;
    default:
      return null;
  }
}

/**
 * Anything not in this explicit list becomes `'unknown'` — including a
 * missing/undefined tag. A1 carries intent through when the ingest layer
 * already declared it; it never infers one (see `ShotIntent`'s doc comment
 * in `types.ts`).
 */
function normalizeIntent(raw: string | null | undefined): ShotIntent {
  switch (raw) {
    case 'layup':
    case 'go_for_green':
    case 'recovery':
    case 'putt':
      return raw;
    default:
      return 'unknown';
  }
}

/**
 * The raw shape `normalizeShot` accepts — a plain, DB-shaped record
 * mirroring the relevant `golf_shots` columns (see `engine/shot-source.ts`)
 * plus an optional ingest-provided `intent` tag. Deliberately not
 * `golf_shots`'s generated row type: this module has no DB dependency, and
 * a caller building a fixture or an adapter should not need the full
 * generated schema to construct one.
 */
export interface RawShotInput {
  round_id: string;
  hole_number: number | null;
  shot_number: number | null;
  shot_type: string | null;
  club_type: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: ShotValueUnit | string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: ShotValueUnit | string | null;
  lie_before: string | null;
  lie_after: string | null;
  result: string | null;
  is_penalty: boolean | null;
  /** Ingest-provided, optional. Never inferred here — see `ShotIntent`. */
  intent?: string | null;
  observed_at: string;
}

/** Convert one raw shot row into a normalized `ShotFact`. Pure — no I/O,
 *  no defaults borrowed from sibling fields. */
export function normalizeShot(raw: RawShotInput): ShotFact {
  const before = normalizeShotValue(raw.distance_to_hole_before, raw.distance_unit_before);
  const after = normalizeShotValue(raw.distance_to_hole_after, raw.distance_unit_after);
  return {
    round_id: raw.round_id,
    hole_number: raw.hole_number,
    shot_number: raw.shot_number,
    shot_type: normalizeShotType(raw.shot_type),
    club_type: normalizeClubType(raw.club_type),
    intent: normalizeIntent(raw.intent),
    distance_to_hole_before_feet: toFeetOrNull(before),
    distance_to_hole_after_feet: toFeetOrNull(after),
    lie_before: raw.lie_before,
    lie_after: raw.lie_after,
    result: raw.result,
    is_penalty: raw.is_penalty === true,
    observed_at: raw.observed_at,
  };
}
