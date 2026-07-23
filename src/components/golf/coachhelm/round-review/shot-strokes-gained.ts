/**
 * shot-strokes-gained.ts — per-shot Strokes Gained for Round Review.
 *
 * Thin, PURE wrapper around the CANONICAL SG engine in
 * `golf-stats-calculator-shots.ts` (`calculateStrokesGainedForShot` /
 * `getExpectedStrokes`) — the file the app's DB `sg_expected_strokes()`
 * function and every other live SG surface (player stats, ShotAnalysisCard,
 * the round-level `strokes_gained_*` cache columns) are calibrated against.
 *
 * NEVER import from `src/lib/golf/strokes-gained.ts` — that file carries its
 * own separately-maintained (currently numerically-identical, but
 * unpatched-on-drift) benchmark table + interpolator. It's dead code for
 * real computation today (nothing calls its `getExpectedStrokes` for a real
 * SG number — see the accuracy report §3.2); wiring a new per-shot SG
 * readout to it would silently start running unpatched calibration logic
 * the moment it's called.
 *
 * No Supabase, no React — pure functions over already-fetched shot rows, so
 * every branch is fixture-testable without mocking anything.
 */
import {
  calculateStrokesGainedForShot,
  getStrokesGainedCategory,
  getPenaltyCategory,
  type RawShot,
} from '@/lib/utils/golf-stats-calculator-shots';

/**
 * Per-shot Strokes Gained, scaled to the player's team baseline (women's
 * 1.083, NCAA D1/D2/D3, etc. — see the `sg_scale_for_player` RPC /
 * `sg_baseline_scale`). `scale` defaults to 1.0 (PGA Tour / men's), matching
 * every other caller of `calculateStrokesGainedForShot` in the app when no
 * scale is resolved yet.
 *
 * Null-honest: returns `null` (never a fabricated 0) when the shot's
 * `lie_before`/`distance_to_hole_before` is missing — mirrors the underlying
 * engine exactly; this wrapper adds no new fallback behavior of its own.
 */
export function computeShotStrokesGained(shot: RawShot, scale = 1): number | null {
  return calculateStrokesGainedForShot(shot, scale);
}

/**
 * Attaches `sg` to every shot in `shots`, computed via
 * `computeShotStrokesGained`. Returns a NEW array (pure — never mutates the
 * input) so a caller building a `ShotInput`-shaped object can spread the
 * result directly. `T` must be `RawShot`-compatible (whatever the caller's
 * normalized raw-fetch-row shape is), so the same helper works for the
 * round-review fetch and any future caller without re-deriving the SG call.
 */
export function attachShotStrokesGained<T extends RawShot>(
  shots: T[],
  scale = 1,
): (T & { sg: number | null })[] {
  return shots.map((shot) => ({ ...shot, sg: computeShotStrokesGained(shot, scale) }));
}

/** Sum of a hole's per-shot Strokes Gained, plus how complete that sum is —
 *  the "expected vs actual" total a later narrative wave can render (e.g.
 *  "this hole cost you 1.8 strokes vs the field"). */
export interface HoleStrokesGainedTotal {
  /** Sum of every shot's non-null `sg` on this hole. `null` when ZERO shots
   *  on the hole could be scored — never a fabricated `0`, which would
   *  misleadingly read as "even par strokes-gained" rather than "no data." */
  total: number | null;
  /** How many of the hole's shots contributed a non-null `sg`. */
  computedShots: number;
  /** Total shots on the hole (computed + uncomputed). */
  totalShots: number;
}

/**
 * Sums whatever shots on a hole DID compute an `sg` (never substitutes 0 for
 * a shot that returned null) — always the honest sum of what's known.
 * `computedShots`/`totalShots` on the return value discloses how complete
 * that known subset is, so a caller can decide whether to caveat a partial
 * total (e.g. "5 of 7 shots scored") rather than silently presenting it as
 * the whole hole.
 */
export function sumHoleStrokesGained(
  shots: Array<{ sg?: number | null }>,
): HoleStrokesGainedTotal {
  let total = 0;
  let computedShots = 0;
  for (const shot of shots) {
    if (typeof shot.sg === 'number' && Number.isFinite(shot.sg)) {
      total += shot.sg;
      computedShots += 1;
    }
  }
  return {
    total: computedShots > 0 ? total : null,
    computedShots,
    totalShots: shots.length,
  };
}

// ============================================================================
// PER-CATEGORY ATTRIBUTION (Wave D, 2026-07-23) — the "1.1 off the tee, 1.0
// putting" breakdown behind ReviewHero's per-hole narrative line. Buckets
// each shot's ALREADY-COMPUTED `sg` (never re-derived) into the canonical
// tee/approach/around_green/putting categories via `getStrokesGainedCategory`/
// `getPenaltyCategory` — the SAME functions the round-level aggregate stats
// engine uses (SG-4's "charge a penalty to the offending category" rule) —
// so a hole's narrative agrees with how the app buckets SG everywhere else,
// not a second, drifting convention invented here.
// ============================================================================

export type SgAttributionCategory = 'tee' | 'approach' | 'around_green' | 'putting';

/** Minimal shape needed to bucket an already-computed `sg` — a caller that
 *  already has a per-shot `sg` (e.g. `ReviewShotInput`, computed once at
 *  fetch time via `computeShotStrokesGained`) passes it straight through;
 *  only the CATEGORY LABEL is derived here. */
export interface CategorizableShot {
  shot_type?: string | null;
  lie_before?: string | null;
  distance_to_hole_before?: number | null;
  distance_unit_before?: string | null;
  is_penalty?: boolean | null;
  sg?: number | null;
}

export interface HoleStrokesGainedByCategory extends HoleStrokesGainedTotal {
  tee: number | null;
  approach: number | null;
  around_green: number | null;
  putting: number | null;
}

/** `getStrokesGainedCategory`/`getPenaltyCategory` type their parameter as
 *  the full `RawShot` (id/round_id/hole_number/… required) but only ever
 *  READ `shot_type`/`lie_before`/`distance_to_hole_before`/
 *  `distance_unit_before` — every other field below is an inert placeholder,
 *  mirroring `toRawShot`'s identical pattern in `round-review-shots.ts`. */
function toCategorizableRawShot(shot: CategorizableShot): RawShot {
  return {
    id: '',
    round_id: '',
    hole_number: 0,
    shot_number: 0,
    shot_type: shot.shot_type ?? null,
    club_type: null,
    lie_before: shot.lie_before ?? null,
    distance_to_hole_before: shot.distance_to_hole_before ?? null,
    distance_unit_before: shot.distance_unit_before ?? null,
    result: null,
    distance_to_hole_after: null,
    distance_unit_after: null,
    miss_direction: null,
    putt_break: null,
  };
}

/**
 * Per-category sum of a hole's shots' `sg`, using the canonical
 * tee/approach/around_green/putting attribution. `par` is used ONLY for the
 * "a par-3 tee shot buckets as approach" rule the canonical functions apply
 * (`par ?? 0` when unknown, which simply never matches the par-3 special
 * case — a safe, honest default, never a fabricated par). Null-honest
 * throughout: a category with zero contributing shots stays `null`, never a
 * fabricated `0` (mirrors `sumHoleStrokesGained`'s own convention, which this
 * function's `total`/`computedShots`/`totalShots` fields reproduce exactly).
 */
export function sumHoleStrokesGainedByCategory(
  shots: CategorizableShot[],
  par: number | null,
): HoleStrokesGainedByCategory {
  let total = 0;
  let computedShots = 0;
  const sums: Record<SgAttributionCategory, number> = {
    tee: 0,
    approach: 0,
    around_green: 0,
    putting: 0,
  };
  const hasValue: Record<SgAttributionCategory, boolean> = {
    tee: false,
    approach: false,
    around_green: false,
    putting: false,
  };

  for (const shot of shots) {
    if (typeof shot.sg !== 'number' || !Number.isFinite(shot.sg)) continue;
    const rawShot = toCategorizableRawShot(shot);
    const parForCategory = par ?? 0;
    const category: SgAttributionCategory = shot.is_penalty
      ? getPenaltyCategory(rawShot, parForCategory)
      : getStrokesGainedCategory(rawShot, parForCategory);

    total += shot.sg;
    computedShots += 1;
    sums[category] += shot.sg;
    hasValue[category] = true;
  }

  return {
    total: computedShots > 0 ? total : null,
    computedShots,
    totalShots: shots.length,
    tee: hasValue.tee ? sums.tee : null,
    approach: hasValue.approach ? sums.approach : null,
    around_green: hasValue.around_green ? sums.around_green : null,
    putting: hasValue.putting ? sums.putting : null,
  };
}
