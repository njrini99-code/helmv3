/**
 * Pure, DB-free shot/hole types for the v3 "situational intelligence"
 * context layer (repair-plan addendum §13, work package A1).
 *
 * Nothing in this module reads `golf_shots`/`golf_holes` or any other
 * table — see `normalize-shot.ts` for the raw-row → `ShotFact` conversion
 * and `build-hole-sequence.ts` for the per-hole validator built on top of
 * these types. Wiring a DB-backed adapter (`load-player-context.ts`, and
 * the `shot-source.ts`/`generator-base.ts` integration) is a later slice —
 * this package intentionally stops at pure functions over plain data so it
 * can be tested and reasoned about without a database.
 */

/**
 * `golf_shots.shot_type`, normalized. Anything this data model doesn't
 * recognize collapses to `'unknown'` rather than being silently
 * miscategorized as one of the four real types.
 */
export type ShotType = 'tee' | 'approach' | 'around_green' | 'putting' | 'unknown';

/**
 * `golf_shots.club_type` (3-bucket model — master plan Part V.1.5; no
 * per-iron/per-wedge distinction at the data layer). `null` when not
 * recorded or not one of the three buckets — never guessed.
 */
export type ClubType = 'driver' | 'non_driver' | 'putter' | null;

/**
 * What the shot was FOR, independent of its outcome — and independent of
 * A2's (out of scope here) distance/par-based layup INFERENCE. This field
 * only ever reflects what the ingest layer explicitly tagged. A par-5
 * 175+yd approach that misses the green is `'unknown'` here, never
 * silently `'go_for_green'`: guessing intent from distance and outcome is
 * exactly the false-precision A2 exists to fix carefully, and A1 must not
 * pre-empt that by inferring anything.
 *
 * `golf_shots` has no column backing this field today — no ingest layer
 * currently writes an intent tag, so every real fact normalizes to
 * `'unknown'` until an annotations table (or equivalent) exists to source
 * it from. The type and the normalization path are written now so nothing
 * downstream has to change shape once that source lands.
 */
export type ShotIntent = 'layup' | 'go_for_green' | 'recovery' | 'putt' | 'unknown';

/**
 * A single normalized shot. Distances are canonicalized to FEET (see
 * `normalize-shot.ts`'s `normalizeShotValue` for the before/after
 * conversion and the exact missing-vs-zero distinction):
 *
 *   - `null`  — no measurement exists (absent value, or a value recorded
 *               with no usable unit). Never coerced to `0`.
 *   - `0`     — a real, recorded zero-distance state (e.g. the ball is
 *               already at the hole). Never coerced to `null`.
 */
export interface ShotFact {
  round_id: string;
  /** `golf_shots.hole_number` is NOT NULL in the database. This field stays
   *  nullable in the type only to guard non-DB inputs (a fixture, a future
   *  adapter) that might omit it — never coerced to a number so a caller
   *  can't accidentally group a genuine gap under hole 0/1. */
  hole_number: number | null;
  /** `golf_shots.shot_number` is NOT NULL in the database, nullable here
   *  for the same non-DB-input reason. `buildHoleSequence` treats an actual
   *  `null` as an explicit ordering gap, not a shot to silently drop. */
  shot_number: number | null;
  shot_type: ShotType;
  club_type: ClubType;
  intent: ShotIntent;
  distance_to_hole_before_feet: number | null;
  distance_to_hole_after_feet: number | null;
  lie_before: string | null;
  lie_after: string | null;
  /** Per-shot result, e.g. `'green' | 'hole' | 'gir'` (found the green /
   *  holed out) vs `'fairway' | 'rough' | 'sand' | 'other'` (missed).
   *  `null` when not recorded or not meaningful for this shot type. */
  result: string | null;
  is_penalty: boolean;
  /** `golf_shots.putt_made` (nullable). A hole can terminate either by
   *  `result === 'hole'` or by `putt_made === true` — the rest of the
   *  codebase (`round-review-system.ts`, `round-review-content.ts`) treats
   *  both as holing out, and the shot-edit path (`golf.ts`'s
   *  `updateShotImpl`) can set this independently of `result`.
   *  `buildHoleSequence`'s termination check mirrors that OR. */
  putt_made: boolean | null;
  /** `golf_shots.miss_direction` — raw passthrough, never derived here.
   *  `'short'|'long'|'left'|'right'|'short_left'|...` in production; a
   *  direction can carry BOTH a short/long and a left/right pole (see
   *  `approach-miss.ts`'s `classifyMiss`). `null` when not recorded — added
   *  for `metrics/distance-profile.ts`'s direction-coverage metric (A2),
   *  which needs to state what fraction of misses have NO direction
   *  reading, not just what the recorded ones say. */
  miss_direction: string | null;
  /** Source observation time (ISO 8601) — when the shot was actually
   *  recorded, independent of the consuming `AnalysisScope.analysis_cutoff`. */
  observed_at: string;
}

/**
 * Authoritative per-hole totals a shot sequence is checked AGAINST — these
 * come from the hole's own recorded row, never derived from the shots
 * themselves. Mirrors `engine/hole-diagnosis.ts`'s `DiagnosisHole`:
 * `penalty_strokes` is the canonical count of `is_penalty` shots (NOT a
 * drifted round-level column), and `total_strokes` is the hole's final
 * recorded score.
 */
export interface HoleContext {
  round_id: string;
  /**
   * `golf_rounds.course_id`. `null` when the round was logged without one.
   * Two holes can share `hole_number` on DIFFERENT courses — a bare
   * `hole_number` is only an ordinal position, never a cross-round
   * identity (evidence contract, "Specific-hole scoring"). See
   * `holeIdentityKey` for the identity rule this field feeds.
   */
  course_id: string | null;
  hole_number: number;
  par: number;
  /** `golf_holes.score` is nullable in the database, but this field is not:
   *  a `HoleContext` must only ever be constructed for a hole with a
   *  non-null score. A null score means "exclude this hole", mirroring
   *  `engine/hole-diagnosis.ts`'s `if (r.score === null) continue` — that
   *  exclusion is the adapter's (`load-player-context.ts`, not yet built)
   *  job to enforce; this type does not represent "unknown total". */
  total_strokes: number;
  /** `golf_holes.penalty_strokes` is nullable in the database, and unlike
   *  `total_strokes` this field stays nullable here: `null` means "not
   *  recorded", not "zero". This is a deliberate departure from
   *  `hole-diagnosis.ts`'s engine-level `r.penalty_strokes ?? 0` — that
   *  default is a fine choice for one consumer's arithmetic, but A1's job
   *  is to state the fact without making that choice for every caller.
   *  `buildHoleSequence` skips the penalty-count reconciliation entirely
   *  when this is `null`, rather than comparing against an assumed 0. */
  penalty_strokes: number | null;
  putts: number | null;
  gir: boolean | null;
  /** `golf_holes.yardage`. Nullable in the database — not every hole has a
   *  recorded yardage — and stays nullable here, never defaulted. */
  yardage: number | null;
}

/**
 * A cross-round, collision-safe key for grouping the SAME physical hole.
 * Returns `null` — "cannot be safely grouped" — when `course_id` is
 * missing, rather than falling back to `hole_number` alone. A missing
 * `course_id` must never be treated as equal to another missing
 * `course_id` just because both hole numbers match (the two-course
 * same-hole-number fixture in
 * `src/test/coachhelm/v3/fixtures/situational-intelligence.ts` is the
 * counterexample this guards against). Acting on the collision (grouping,
 * excluding ungrouped rounds, reporting counts) is addendum A3's job; A1
 * only states the rule so nothing downstream has to reinvent it.
 */
export function holeIdentityKey(
  hole: Pick<HoleContext, 'course_id' | 'hole_number'>,
): string | null {
  if (!hole.course_id) return null;
  return `${hole.course_id}:${hole.hole_number}`;
}

/**
 * The scope a normalization/aggregation pass runs under.
 */
export interface AnalysisScope {
  player_id: string;
  /** Inclusive ISO date; `null` = no lower bound (lifetime). */
  window_start: string | null;
  /** Inclusive ISO date; `null` = no upper bound. */
  window_end: string | null;
  /**
   * ISO 8601 instant. A fact observed after this must be excluded even
   * when it falls inside `[window_start, window_end]`, so a fixture (or a
   * later cache read) stays reproducible however much new data has since
   * been recorded. Enforcing this against a live source is
   * `load-player-context.ts`'s job (a later slice); A1's fixtures and
   * types only carry the value so that contract can't drift once written.
   */
  analysis_cutoff: string;
}
