/**
 * HoleShotPath — types.
 *
 * The component's input is the raw shot ledger for one hole + a few
 * metadata bits. We DO NOT pass club info (3-bucket model — clubs
 * aren't surfaced in v3 vocabulary). Every visual decision derives
 * from the player's logged shot data: where the ball ended up
 * (lie_after), how far from the pin (distance_to_hole_after), which
 * side it missed (miss_direction). The hole's hazards are RECONSTRUCTED
 * from those endpoints — if the player said "ended in bunker 112y
 * out," we draw the bunker exactly there.
 */

export type Lie =
  | 'tee'
  | 'fairway'
  | 'rough'
  | 'heavy_rough'
  | 'light_rough'
  | 'sand'
  | 'bunker'
  | 'green'
  | 'fringe'
  | 'water'
  | 'penalty'
  | 'other';

export type MissDirection = 'left' | 'right' | 'long' | 'short' | null;

/** `golf_shots.club_type` — the 3-bucket model referenced above. Kept out of
 *  the geometry/visual language (no club-specific rendering), but useful as
 *  tooltip context. */
export type ClubType = 'driver' | 'non_driver' | 'putter';

/** `golf_shots.penalty_type` — the specific rule violation, when logged.
 *  Richer than the boolean `is_penalty` flag alone. */
export type PenaltyType = 'ob' | 'water' | 'unplayable' | 'lost';

/** `golf_shots.putt_break` / `putt_slope` — green-reading context, only
 *  meaningful when the shot's `lie_after` is `'green'`. */
export type PuttBreak = 'right_to_left' | 'left_to_right' | 'straight' | 'multiple';
export type PuttSlope = 'uphill' | 'downhill' | 'level' | 'severe';

/** Minimum shape the component needs from a `golf_shots` row. */
export interface ShotInput {
  shot_number: number;
  /** Lie the ball ended up in (where this shot's endpoint sits). */
  lie_after: Lie | string | null;
  /** Lie the ball came from (used for the tee marker on shot 1). */
  lie_before?: Lie | string | null;
  /** Distance to the hole AFTER the shot — YARDS off the green, FEET on it.
   *  `lie_after` is the primary signal for that switch (matches every
   *  write/read path in the app, see geometry.ts's UNIT HANDLING doc);
   *  `distance_unit_after` is only consulted for non-green lies. */
  distance_to_hole_after: number | null;
  /** Distance to the hole BEFORE the shot, optional. Same yards-off/
   *  feet-on-green convention, gated on `lie_before`. */
  distance_to_hole_before?: number | null;
  /** Secondary unit signal for `distance_to_hole_before`, consulted only
   *  when `lie_before` isn't `'green'`. `golf_shots` defaults this column
   *  to `'yards'`; only an explicit `'feet'` flips interpretation (see
   *  src/lib/golf/distance-units.ts). Missing/unknown values default to
   *  yards — the geometry never guesses a unit from a value's magnitude,
   *  only from the lie or this explicit tag. */
  distance_unit_before?: string | null;
  /** Secondary unit signal for `distance_to_hole_after`. Same convention
   *  as `distance_unit_before`, gated on `lie_after`. */
  distance_unit_after?: string | null;
  /** Miss direction the player logged for this shot. */
  miss_direction?: MissDirection | string | null;
  is_penalty?: boolean | null;
  /** Real point-to-point length of this shot, when the app logged it
   *  directly (`golf_shots.shot_distance`) rather than it being derivable
   *  from the before/after delta. Same unit convention as the
   *  distance-to-hole fields — see `distance_unit`. Geometry prefers this
   *  over the before/after delta when present. */
  shot_distance?: number | null;
  /** Unit `shot_distance` is stored in (`golf_shots.distance_unit`). Same
   *  convention as `distance_unit_before`/`distance_unit_after`. */
  distance_unit?: string | null;
  /** Club bucket used for this shot — tooltip-only context, never drives
   *  geometry or color (the 3-bucket model isn't part of the v3 visual
   *  vocabulary; see the module doc above). */
  club_type?: ClubType | string | null;
  /** Specific penalty rule, when `is_penalty` is true — replaces the generic
   *  "penalty" tooltip label with e.g. "penalty: water". */
  penalty_type?: PenaltyType | string | null;
  /** Green-read context — only rendered when `lie_after === 'green'`. */
  putt_break?: PuttBreak | string | null;
  putt_slope?: PuttSlope | string | null;
  /** Free-text note the player logged on this shot, if any. */
  notes?: string | null;
  /** Per-shot Strokes Gained, when the DATA LAYER has already computed it
   *  (via `golf-stats-calculator-shots.ts`'s `calculateStrokesGainedForShot`
   *  — geometry.ts stays pure and never runs SG math itself). Null-honest:
   *  null when unavailable/uncomputed, never a fabricated 0. */
  sg?: number | null;
  /** `golf_shots.putt_made` / `putt_details.made` — explicit make/miss for a
   *  putt (the correct source of truth, not positional inference from
   *  "is this the pin-snapped last shot"). Null for non-putts / unlogged. */
  putt_made?: boolean | null;
  /** `putt_details.miss_tags` — e.g. `['short','low']`. Only meaningful on a
   *  missed putt; null when unlogged or not a putt. */
  miss_tags?: string[] | null;
  /** `putt_details.estimated_break_inches` — a genuinely logged number
   *  (unlike lateral X, this one IS real when present), 0–120. Null when
   *  unlogged. */
  estimated_break_inches?: number | null;
}

export interface HoleShotPathProps {
  /** Hole number (1-18). Shown in the header. */
  hole_number?: number;
  /** Par for the hole — used as the total-yardage fallback when shot 1's
   *  `distance_to_hole_before` isn't logged. */
  par?: 3 | 4 | 5;
  /** Override the total hole yardage. Otherwise inferred from shot 1's
   *  distance_to_hole_before, then par. */
  yardage?: number | null;
  /** Player's total score on this hole. Renders as a score badge. */
  score?: number | null;
  /** Player's shots IN PLAY ORDER (shot_number ascending). */
  shots: ShotInput[];
  /**
   * Visual size variant.
   *   - 'strip'      : ~28×112 px — for the 18-hole at-a-glance grid
   *   - 'card'       : ~140×320 px — fixed-size inline per-hole card
   *   - 'inline'     : ~112×240 px — compact round-review preview
   *   - 'reviewCard' : fluid (w-full, 140:320 aspect) — the framed round-review grid
   *   - 'hero'       : ~280×560 px — detail view when a strip is tapped
   */
  size?: 'strip' | 'inline' | 'card' | 'reviewCard' | 'hero';
  /** Optional click handler — strip variant uses this to expand to hero. */
  onClick?: () => void;
  /** Tone of the score chip vs par. */
  className?: string;
  /** Override the SVG box's ring color (default a neutral hairline). Used by
   *  the 18-hole strip filmstrip to lay a score-vs-par tone ring over the
   *  premium visual (birdie/bogey/double) without touching the lie-based
   *  shot coloring inside the SVG itself. */
  ringClassName?: string;
  /**
   * Controlled "this hole is the active one" signal from a parent that
   * hosts MANY simultaneous instances (the 18-hole `Filmstrip` strip) and
   * needs the shot-by-shot draw-in replay to fire on ITS OWN hover state
   * rather than a self-managed one. A `false → true` edge triggers one
   * draw-in pass at strip scale (segments only — see the module doc);
   * `true → false` snaps back to the fully-drawn static path instantly, so
   * the next `false → true` edge replays from empty (never a loop while
   * still hovered). Omit for standalone / single-instance usage (e.g. the
   * round-review detail panel) — those draw in once on mount instead, which
   * a parent can force to repeat by remounting on a `key` change (see
   * `ReviewHero`'s `key={openHole}`).
   */
  active?: boolean;
}

/**
 * Normalize an incoming lie string into the canonical Lie union so
 * downstream visuals can switch cleanly. Tolerant of any string
 * coming from the v2 shot ledger.
 */
export function normalizeLie(raw: Lie | string | null | undefined): Lie | 'other' {
  if (!raw) return 'other';
  const s = String(raw).toLowerCase().trim();
  if (s === 'tee') return 'tee';
  if (s === 'fairway') return 'fairway';
  if (s === 'rough' || s === 'heavy_rough' || s === 'light_rough') return 'rough';
  if (s === 'sand' || s === 'bunker') return 'sand';
  if (s === 'green') return 'green';
  if (s === 'fringe') return 'fringe';
  if (s === 'water' || s === 'penalty' || s === 'hazard') return 'water';
  return 'other';
}

/**
 * Normalize miss direction. Returns null when the player didn't log one
 * (the geometry treats null as "straight, slight center drift").
 */
export function normalizeMiss(
  raw: MissDirection | string | null | undefined,
): MissDirection {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (s.includes('left')) return 'left';
  if (s.includes('right')) return 'right';
  if (s.includes('long')) return 'long';
  if (s.includes('short')) return 'short';
  return null;
}

/**
 * Normalize `penalty_type` into the canonical `PenaltyType` union, or
 * `null` when unlogged/unrecognized. Used ONLY to branch the hazard glyph
 * (`geometry.ts`'s `plotHole`) — never to overwrite the raw pass-through
 * `PlottedShot.penalty_type` tooltip field, which stays verbatim. An
 * unrecognized string must resolve to `null` here, NOT `'water'` — the
 * caller's job is then to fall back to a generic penalty glyph, never a
 * water glyph, for anything this function can't confidently classify.
 */
export function normalizePenaltyType(
  raw: PenaltyType | string | null | undefined,
): PenaltyType | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (s === 'water') return 'water';
  if (s === 'ob' || s === 'out_of_bounds' || s === 'out of bounds') return 'ob';
  if (s === 'unplayable') return 'unplayable';
  if (s === 'lost' || s === 'lost_ball' || s === 'lost ball') return 'lost';
  return null;
}
