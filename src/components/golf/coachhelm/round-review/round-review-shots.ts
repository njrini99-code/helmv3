/**
 * round-review-shots.ts — golf_shots -> ShotInput view-model for Round Review.
 *
 * PURE mapping from a raw `golf_shots` row (joined with `putt_details` /
 * `approach_miss_details`) to the `ShotInput` shape `HoleShotPath` /
 * `PuttingZoom` consume, PLUS the per-shot Strokes Gained attach step
 * (`shot-strokes-gained.ts`). No React — `FilmstripReview.tsx` owns the
 * `golf_shots` fetch itself (an auth-bound client component); this file is
 * the testable adapter layer it calls into, mirroring
 * `buildReviewViewModel.ts`'s pure-adapter pattern for the rest of the
 * review surface. The ONE exception is `fetchPlayerPuttMakePct` (Wave D,
 * below) — a small, self-contained Supabase read `ReviewHero.tsx` calls
 * directly (it isn't part of the `golf_shots` ledger fetch `FilmstripReview`
 * owns), kept here rather than a new file per this wave's own brief.
 *
 * STEP 1 population findings this module's field selection is based on
 * (prod COUNTs, 2026-07-23):
 *   - `putt_details.miss_tags`            898 / 3,306 non-empty  -> SURFACE
 *   - `putt_details.break_direction`    3,306 / 3,306 (100%)     -> duplicate
 *     of `golf_shots.putt_break` (already fetched there); not re-mapped.
 *   - `putt_details.made`               3,306 / 3,306 (100%)     -> used ONLY
 *     as a `putt_made` fallback (see `mapShotRowToReviewShot`), never a
 *     separate surfaced field.
 *   - `putt_details.estimated_break_inches`   0 / 3,306 (0%)     -> DARK, no
 *     writer yet. NOT selected, NOT surfaced. (`ShotInput.estimated_break_inches`
 *     stays `undefined` on every mapped shot until a writer exists.)
 *   - `approach_miss_details.lie_type`               1,048 / 1,048 -> SURFACE
 *   - `approach_miss_details.distance_from_green_yards` 1,048/1,048 -> SURFACE
 *   - `approach_miss_details.miss_direction`         1,043 / 1,048 -> NOT
 *     selected — redundant with `golf_shots.miss_direction` for these rows
 *     (same 8-way enum, not richer).
 *   - `golf_player_stats_cache.putt_make_pct_left_to_right` /
 *     `_right_to_left` / `_straight`:  0 / 29 rows (100% dark, no writer) ->
 *     NEVER used — dead, matches PuttingZoom's own "DEAD DATA" note. The
 *     BY-DISTANCE bands (`putt_make_pct_0_3ft`…`_20_plus_ft`) are a DIFFERENT,
 *     confirmed-populated set of columns — see `fetchPlayerPuttMakePct` below.
 */
import type { ShotInput } from '@/components/golf/coachhelm/v3/HoleShotPath/types';
import type { RawShot } from '@/lib/utils/golf-stats-calculator-shots';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { computeShotStrokesGained } from './shot-strokes-gained';

/** One embedded `putt_details` row (1:1 via `shot_id`). Only fields that add
 *  NEW information beyond `golf_shots` are selected — see the module doc. */
interface RawPuttDetailsEmbed {
  miss_tags: string[] | null;
  made: boolean | null;
}

/** One embedded `approach_miss_details` row — see the module doc for why
 *  `miss_direction` is deliberately not selected here. */
interface RawApproachMissEmbed {
  lie_type: string | null;
  distance_from_green_yards: number | null;
}

/** The raw `golf_shots` row shape this module's fetch selects (see the
 *  `.select()` in `FilmstripReview.tsx`), embeds included. Supabase returns
 *  a 1:1 embed as either a single object or a 1-element array depending on
 *  FK cardinality inference — both are accepted (`normalizeEmbed` below). */
export interface RawGolfShotRow {
  id: string;
  hole_number: number;
  shot_number: number;
  shot_type: string | null;
  lie_before: string | null;
  lie_after: string | null;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  distance_unit_before: string | null;
  distance_unit_after: string | null;
  shot_distance: number | null;
  putt_distance_feet: number | null;
  putt_made: boolean | null;
  result: string | null;
  miss_direction: string | null;
  is_penalty: boolean | null;
  club_type: string | null;
  penalty_type: string | null;
  putt_break: string | null;
  putt_slope: string | null;
  notes: string | null;
  putt_details: RawPuttDetailsEmbed | RawPuttDetailsEmbed[] | null;
  approach_miss_details: RawApproachMissEmbed | RawApproachMissEmbed[] | null;
}

/** `ShotInput` plus round-review-only "dark detail" fields that don't (yet)
 *  have a place in `HoleShotPath`'s geometry vocabulary (`types.ts` owns
 *  that contract — Wave A, not touched here) — ready for a later wave's
 *  putt/approach detail panel to consume without a second query. `sg`,
 *  `putt_made`, and `miss_tags` ARE real `ShotInput` fields (Wave A). */
export interface ReviewShotInput extends ShotInput {
  /** `approach_miss_details.lie_type` — an 11-value enum, finer than
   *  `lie_after`'s 8-value one. Null when this shot isn't an approach/
   *  around-green miss row with a logged detail row, or predates the
   *  2026-05-27 baseline that added the table. */
  approach_miss_lie_type?: string | null;
  /** `approach_miss_details.distance_from_green_yards` — distance from the
   *  GREEN EDGE, not the pin; a distinct, more short-game-relevant number
   *  than `distance_to_hole_after`. Same nullability caveat as above. */
  approach_miss_distance_from_green_yards?: number | null;
  /** `golf_shots.shot_type` verbatim ('tee'/'approach'/'around_green'/
   *  'putting'/'penalty', legacy raw values also seen — see
   *  `normalizeShotType`). Not part of `HoleShotPath`'s geometry vocabulary
   *  (the diagram never colors/positions by it), but the ONE field needed to
   *  bucket a shot's `sg` into the canonical tee/approach/around_green/
   *  putting attribution (`shot-strokes-gained.ts`'s
   *  `sumHoleStrokesGainedByCategory`) for `ReviewHero`'s per-hole "expected
   *  vs actual" narrative — see that component's `openHoleSg`. */
  shot_type?: string | null;
}

function normalizeEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Builds a `RawShot`-compatible object for the SG engine from one fetched
 * row. `round_id`/`hole_id` are NOT consumed by `calculateStrokesGainedForShot`
 * (verified against the function body — it only reads lie/distance/result/
 * shot_type/putt fields) — the empty-string placeholder below only exists to
 * satisfy `RawShot`'s required-field shape; it's never surfaced to a user.
 */
function toRawShot(row: RawGolfShotRow): RawShot {
  return {
    id: row.id,
    round_id: '',
    hole_number: row.hole_number,
    shot_number: row.shot_number,
    shot_type: row.shot_type,
    club_type: row.club_type,
    lie_before: row.lie_before,
    lie_after: row.lie_after,
    distance_to_hole_before: row.distance_to_hole_before,
    distance_unit_before: row.distance_unit_before,
    result: row.result,
    distance_to_hole_after: row.distance_to_hole_after,
    distance_unit_after: row.distance_unit_after,
    shot_distance: row.shot_distance,
    miss_direction: row.miss_direction,
    putt_break: row.putt_break,
    putt_distance_feet: row.putt_distance_feet,
    putt_slope: row.putt_slope,
    putt_made: row.putt_made,
    is_penalty: row.is_penalty,
    penalty_type: row.penalty_type,
  };
}

/**
 * Maps one raw `golf_shots` (+ embeds) row to the `ReviewShotInput` the
 * diagram/putting-zoom/summary consume, with per-shot Strokes Gained already
 * attached (`sg`, computed via the canonical `golf-stats-calculator-shots.ts`
 * engine — see `shot-strokes-gained.ts`). `sgScale` is the caller-resolved
 * per-team baseline scale (see the `sg_scale_for_player` RPC); defaults to 1
 * (PGA Tour / men's) so a caller that hasn't resolved a scale yet still gets
 * an honest (if unscaled) value rather than skipping SG entirely.
 */
export function mapShotRowToReviewShot(row: RawGolfShotRow, sgScale = 1): ReviewShotInput {
  const rawShot = toRawShot(row);
  const puttDetails = normalizeEmbed(row.putt_details);
  const approachMissDetails = normalizeEmbed(row.approach_miss_details);

  return {
    shot_number: row.shot_number,
    lie_after: row.lie_after,
    lie_before: row.lie_before,
    distance_to_hole_after: row.distance_to_hole_after,
    distance_to_hole_before: row.distance_to_hole_before,
    distance_unit_before: row.distance_unit_before,
    distance_unit_after: row.distance_unit_after,
    miss_direction: row.miss_direction,
    is_penalty: row.is_penalty,
    shot_distance: row.shot_distance,
    club_type: row.club_type,
    penalty_type: row.penalty_type,
    putt_break: row.putt_break,
    putt_slope: row.putt_slope,
    notes: row.notes,
    sg: computeShotStrokesGained(rawShot, sgScale),
    // `golf_shots.putt_made` is the primary source (populated on every
    // logged putt); `putt_details.made` is a same-value fallback for the
    // rare row where the parent column is null but the detail row exists
    // (prod: `made` is never null on any of the 3,306 putt_details rows).
    putt_made: row.putt_made ?? puttDetails?.made ?? null,
    miss_tags: puttDetails?.miss_tags ?? null,
    approach_miss_lie_type: approachMissDetails?.lie_type ?? null,
    approach_miss_distance_from_green_yards:
      approachMissDetails?.distance_from_green_yards ?? null,
    shot_type: row.shot_type,
  };
}

/**
 * Groups a round's raw shot rows by hole, mapping each to a
 * `ReviewShotInput` (SG attached) — the whole payload `FilmstripReview.tsx`'s
 * fetch effect hands to `ReviewHero` / `HoleShotPath` / `PuttingZoom`. Rows
 * are expected already ordered by `(hole_number, shot_number)` (the fetch's
 * `.order()` calls) — this function preserves whatever order it's given, it
 * doesn't re-sort.
 */
export function buildReviewShotsByHole(
  rows: RawGolfShotRow[],
  sgScale = 1,
): Map<number, ReviewShotInput[]> {
  const map = new Map<number, ReviewShotInput[]>();
  for (const row of rows) {
    const shot = mapShotRowToReviewShot(row, sgScale);
    const list = map.get(row.hole_number) ?? [];
    list.push(shot);
    map.set(row.hole_number, list);
  }
  return map;
}

// ============================================================================
// SEASON PUTT MAKE% BY DISTANCE (Wave D, 2026-07-23) — the honest "your
// season" context line in PuttingZoom's putt tooltip. `golf_player_stats_cache
// .putt_make_pct_{0_3,3_5,5_10,10_15,15_20,20_plus}ft` (BY DISTANCE) is
// confirmed populated in prod (`update_player_putt_make_pct()`, migration
// 20260606160000) — a DIFFERENT set of columns from the BY-BREAK-DIRECTION
// ones (`putt_make_pct_left_to_right`/`_right_to_left`/`_straight`) flagged
// dead in this module's own doc above; only the by-distance set is fetched
// here, and PuttingZoom must never surface the by-break set regardless.
// ============================================================================

export type PuttMakePctBand = '0_3' | '3_5' | '5_10' | '10_15' | '15_20' | '20_plus';

export interface PuttMakePctByBand {
  '0_3': number | null;
  '3_5': number | null;
  '5_10': number | null;
  '10_15': number | null;
  '15_20': number | null;
  '20_plus': number | null;
}

const PUTT_MAKE_PCT_BAND_LABEL: Record<PuttMakePctBand, string> = {
  '0_3': '0-3 ft',
  '3_5': '3-5 ft',
  '5_10': '5-10 ft',
  '10_15': '10-15 ft',
  '15_20': '15-20 ft',
  '20_plus': '20+ ft',
};

/** Human label for a band, e.g. `'3-5 ft'` — shared by the tooltip so its
 *  copy always names the exact band `bandForPuttFeet` bucketed into. */
export function puttMakePctBandLabel(band: PuttMakePctBand): string {
  return PUTT_MAKE_PCT_BAND_LABEL[band];
}

/**
 * Buckets a putt's real logged length (feet) into the SAME 6 bands
 * `update_player_putt_make_pct()` bins made/missed putts into when it writes
 * these cache columns (verbatim from that function's SQL, migration
 * 20260606160000): left-inclusive / right-exclusive — `feet < 3` -> `0_3`,
 * `3 <= feet < 5` -> `3_5`, ... `feet >= 20` -> `20_plus`. Matching the
 * writer's own boundaries exactly is what makes the tooltip's "your season"
 * number describe the SAME band the putt actually falls in.
 */
export function bandForPuttFeet(feet: number): PuttMakePctBand {
  if (feet < 3) return '0_3';
  if (feet < 5) return '3_5';
  if (feet < 10) return '5_10';
  if (feet < 15) return '10_15';
  if (feet < 20) return '15_20';
  return '20_plus';
}

/**
 * Fetches this player's SEASON putt make% by distance band, for
 * `ReviewHero`'s `PuttingZoom` tooltip context line. Returns `null` on any
 * error, a missing `playerId`, or a missing cache row — never a fabricated
 * placeholder; every band inside the returned object is ALSO independently
 * nullable (a band with zero attempts yet stays `null` even when the row
 * itself exists — `update_player_putt_make_pct()`'s `NULLIF(...,0)` divisor
 * guard already encodes this at the source). Values are stored 0-100 (a
 * literal percent, not a 0-1 fraction — see that migration's `ROUND(100.0*
 * COUNT(...)/...)`) — callers render them directly, no `*100` needed.
 */
export async function fetchPlayerPuttMakePct(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<PuttMakePctByBand | null> {
  if (!playerId) return null;
  const { data, error } = await supabase
    .from('golf_player_stats_cache')
    .select(
      'putt_make_pct_0_3ft, putt_make_pct_3_5ft, putt_make_pct_5_10ft, putt_make_pct_10_15ft, putt_make_pct_15_20ft, putt_make_pct_20_plus_ft',
    )
    .eq('player_id', playerId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    '0_3': data.putt_make_pct_0_3ft ?? null,
    '3_5': data.putt_make_pct_3_5ft ?? null,
    '5_10': data.putt_make_pct_5_10ft ?? null,
    '10_15': data.putt_make_pct_10_15ft ?? null,
    '15_20': data.putt_make_pct_15_20ft ?? null,
    '20_plus': data.putt_make_pct_20_plus_ft ?? null,
  };
}
