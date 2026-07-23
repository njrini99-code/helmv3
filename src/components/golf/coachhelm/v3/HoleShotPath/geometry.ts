/**
 * HoleShotPath — pure geometry.
 *
 * Maps the player's logged shot ledger into TRUE-TO-SCALE SVG coordinates.
 * There is no GPS / course-geometry data anywhere in this app — every
 * along-hole (Y) position below is derived from a REAL logged yardage.
 * Lateral (X) position is a STYLIZED inference from `miss_direction` (we
 * know which side the ball missed, never the literal lateral yardage) —
 * that part has always been, and remains, a visual approximation. Nothing
 * else is invented: a `null` distance in the ledger produces a `null`
 * output field, never a guessed number.
 *
 * ---------------------------------------------------------------------------
 * TWO COORDINATE SYSTEMS
 * ---------------------------------------------------------------------------
 *
 * 1. THE CORRIDOR (`VB`, 100×200) — the whole hole, tee to pin, linear in
 *    real yards for its entire length:
 *      y = PIN.y   (14)  when yards-to-pin = 0
 *      y = TEE.y   (188) when yards-to-pin = total hole yardage
 *    Every point in between is a straight linear interpolation — no
 *    snapping, no clustering, no "putts collapse toward center" fudge.
 *    This is honest but has a known legibility limit: on a 400y hole a
 *    3-foot putt and a 30-foot putt both round to "about 2px from the
 *    pin." That's not a bug, it's what true-to-scale means — which is
 *    exactly why coordinate system #2 exists.
 *
 * 2. THE GREEN INSET (`greenInset`, its own 100×100 space) — a second,
 *    independently-scaled linear plot for on-green shots (putts, plus any
 *    shot that finished within `GREEN_INSET_YARDS_THRESHOLD` yards of the
 *    pin), FEET-scale instead of yards-scale, auto-fit to the real
 *    distances logged on this hole. Think of it as the "detail circle"
 *    printed on a paper scorecard next to the main hole diagram: a
 *    separate honest ruler, not a zoomed crop of the same one. Its
 *    `boundary` circle is a RENDERING FRAME sized from the real max
 *    on-green distance (+ padding) — it is NOT a claim about the actual
 *    green's physical shape or size, which this app has no data for.
 *    `ticks`/`feet_per_unit` make the inset's scale checkable, same as
 *    the corridor's `ticks` do for yards. Every inset shot is positioned
 *    in genuine POLAR form — `true_radius_units` from the pin is ALWAYS
 *    the honest, remaining-feet-derived distance (this field itself is
 *    NEVER altered); only the ANGLE is a stylized (miss-direction-seeded)
 *    approximation, same honesty split as the corridor's Y-is-real/
 *    X-is-stylized rule. See MIN-SEPARATION below for the two cases the
 *    DRAWN position (not `true_radius_units`) is adjusted beyond that
 *    seed — a crowded angle nudge, and a near-pin radial floor.
 *
 * ---------------------------------------------------------------------------
 * PENALTY SHOTS ARE SYMBOLIC — never a fabricated flight
 * ---------------------------------------------------------------------------
 * The app's write path (`use-penalty-handler.ts confirmPenalty()`) never
 * captures how far a shot flew before it became a penalty — a penalty row
 * is pure stroke bookkeeping: `distance_to_hole_after` is always set equal
 * to `distance_to_hole_before`, `shot_distance` is always `0`. There is no
 * real distance to plot a "flight" from, so this module doesn't try:
 *   - A penalty shot's position is its shot's START (`lie_before` /
 *     wherever the previous shot ended) — its own `distance_to_hole_before`
 *     when logged, else literally the previous plotted point. It is NEVER
 *     positioned from `distance_to_hole_after` (which would fabricate a
 *     "the ball flew here and that's where the penalty was called" claim
 *     the data doesn't support).
 *   - No flight segment is emitted for it — a zero-real-distance "shot"
 *     drawing a Bezier line is exactly the old bug (a 280y OB tee shot
 *     reading as "a ~0y stub, shot 1 did nothing"). `PlottedShot.symbolic`
 *     (mirrors `is_penalty` today, kept as a separate field so a future
 *     non-penalty symbolic case doesn't have to overload `is_penalty`)
 *     tells the renderer to draw a symbolic "+1" marker instead of a
 *     numbered flight dot.
 *   - `shot_yards` is forced `null` (never the fabricated `0` the old
 *     before===after math produced — `formatYards(0)` reads "<1 yd", which
 *     is a lie for a real, often 200-300y swing). `remaining_yards` is left
 *     untouched — it's a real, separately-logged number (distance to pin
 *     from the drop) and stays honest on its own.
 *   - The NEXT real shot still connects FROM the penalty's plotted point
 *     (`prev` is updated after every shot, penalty or not) — the sequence
 *     reads as "you were here, this happened, then you played on from
 *     here," which is the truth.
 *   - The hazard glyph this plants is branched by `penalty_type` — see
 *     HAZARDS below. It is NEVER defaulted to water.
 *
 * ---------------------------------------------------------------------------
 * UNIT HANDLING (see src/lib/golf/distance-units.ts for the app-wide rule)
 * ---------------------------------------------------------------------------
 * `golf_shots.distance_to_hole_before/after` are YARDS off the green and
 * FEET on it — and the LIE, not the `distance_unit_before/after` tag, is
 * the primary signal for that switch. This is not a guess: it's the same
 * rule every write path in this app enforces (`use-shot-state-machine.ts`,
 * `FairwayShotTracking.tsx`, `FairwayShotEntry.tsx` all set
 * `lie === 'green' ? 'feet' : 'yards'`) and the same rule every other
 * read path already applies (`coachhelm-data.ts`'s `ShotData` mapper:
 * `lie_after === 'green' ? raw : (distance_unit_after === 'feet' ? raw/3
 * : raw)`; also `strokes-gained.ts`, `golf-stats-calculator-shots.ts`).
 * This module follows the exact same precedence — lie first, explicit
 * unit tag only as a secondary signal for non-green lies (e.g. a fringe
 * shot logged in feet), defaulting to yards when neither says otherwise
 * (the DB column default).
 *
 * This matters here specifically because `FilmstripReview`'s `golf_shots`
 * select does NOT fetch `distance_unit_before/after` — every value that
 * reaches this module today carries no unit tag at all, so the LIE is the
 * *only* signal available for on-green shots. Getting this wrong plots
 * every green-lie shot (the majority of putts a round logs) at 3x its
 * real distance. `shot_distance`, by contrast, is a DESIGN GUARANTEE
 * always-yards column (a putt's own length lives in `putt_distance_feet`,
 * a column this component doesn't currently receive) — so it is converted
 * by the unit tag alone, never by lie.
 *
 * ---------------------------------------------------------------------------
 * LATERAL (X) STYLIZATION
 * ---------------------------------------------------------------------------
 * `miss_direction` drives a per-shot lateral nudge, bounded to the
 * corridor + a rough band around it (never escapes the canvas). Consecutive
 * same-direction misses amplify (a real "leaking it right all day"
 * pattern should read as progressively wider, not just additively wider).
 * Penalty shots widen further. Any deterministic tie-break (e.g. which way
 * a "straight" shot drifts) is seeded from the shot's own `shot_number` —
 * NEVER `Math.random()`, so the exact same shot ledger always plots to the
 * exact same pixels (required for SSR/CSR parity and for stable snapshots
 * across the 18 simultaneous strip instances in the filmstrip). A `long`/
 * `short` miss gets the SAME small "straight" treatment as no-miss-logged —
 * it is an ALONG-AXIS miss (already honestly represented by the shot's
 * real Y position relative to its neighbors), not a LEFT/RIGHT one, so it
 * would be dishonest to invent a lateral offset for it. `miss_direction`
 * itself passes through unchanged on every `PlottedShot` so a renderer can
 * key a long/short-specific glyph (e.g. a wedge pointing up/down the
 * corridor) directly off the real logged value — no geometry change is
 * needed to "unlock" that, the field has always been there.
 *
 * ---------------------------------------------------------------------------
 * GREEN INSET MIN-SEPARATION (the tap-in bug, + the near-pin floor fix)
 * ---------------------------------------------------------------------------
 * `true_radius_units` is ALWAYS the honest value derived from
 * `remaining_feet` (or a documented positional-only fallback when that's
 * unlogged) and is NEVER altered by anything below — the leader tick always
 * discloses this exact number, and relative distance ordering (a 1-footer's
 * TRUE radius is always less than a 3-footer's) is a static fact of the
 * input data, never touched by the collision-resolve pass.
 *
 * What CAN differ from `true_radius_units` is where the dot is actually
 * DRAWN (`PlottedInsetShot.x`/`y`), via two combined mechanisms:
 *
 *   1. RADIAL FLOOR (`GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS`) — a holed putt
 *      is pinned at radius EXACTLY 0 (see below) and angle is mathematically
 *      powerless to separate anything from a point at the origin (sin/cos
 *      of a near-zero radius stays near-zero regardless of angle). So a
 *      non-holed shot whose TRUE radius is small enough that its rendered
 *      ring would overlap the pin glyph / a holed dot's own ring at the
 *      origin is instead DRAWN at `GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS` —
 *      never its true radius. `true_radius_units` stays exactly what it
 *      was; only the display position moves, radially outward. Because
 *      this floor is a per-item comparison against one fixed constant (not
 *      a chain off a neighbor), `display_radius = max(true_radius, FLOOR)`
 *      is a monotonic function of `true_radius` — two shots processed in
 *      true-radius-ascending order can never have their display radii come
 *      out in the wrong order (they can only TIE, at the floor, never
 *      invert). This is the "subway map elastic" distortion `putting-
 *      green-design.md` §4.4-A describes: near-pin stops get schematically
 *      spaced out for legibility, but the true distance stays checkable via
 *      the leader tick + numeric label.
 *   2. ANGULAR FAN — shots are sorted by TRUE radius ascending (ties by
 *      `shot_number`) and walked outward from the pin using each shot's
 *      (possibly-floored) DISPLAY radius; any shot whose display-radius gap
 *      to the previous one (or to the pin itself, for the innermost shot)
 *      is under `GREEN_INSET_MIN_RADIAL_GAP_UNITS` gets a deterministic
 *      angular nudge (`seededSign`-seeded off its own `shot_number`, never
 *      `Math.random()`). The nudge's SIZE is computed dynamically from the
 *      shot's own display radius (`insetFanAngleStep`), not a fixed degree
 *      constant — a fixed angle gives a shrinking linear separation as
 *      radius shrinks (arc length = radius × angle), which is exactly
 *      backwards for the near-pin case this fix targets; the dynamic step
 *      instead solves for the angle that clears a fixed worst-case combined
 *      dot-footprint width at whatever radius it's applied to, so two
 *      dots FLOORED to the identical minimum radius (e.g. two different
 *      tap-ins) still fan apart into distinct, non-overlapping points on
 *      that ring rather than stacking.
 *
 * `leader: true` flags exactly which shots were moved — radially (floored),
 * angularly (fanned), or both — so a renderer can draw a short radial tick
 * disclosing "this one was repositioned for legibility, its true distance
 * is still this smaller number."
 *
 * ---------------------------------------------------------------------------
 * HAZARDS
 * ---------------------------------------------------------------------------
 * A hazard is reconstructed exactly AT the endpoint of the shot that
 * logged that lie — "ended in bunker 112y out" plants the bunker at
 * exactly that corridor position. For a penalty shot, the glyph is
 * branched by `penalty_type` — `water` stays a water glyph; `ob`/`lost`
 * share a neutral `'ob'` glyph (neither is a water event); `unplayable`
 * gets its own `'unplayable'` glyph; `is_penalty` true with no (or an
 * unrecognized) `penalty_type` gets a generic `'penalty'` glyph. Water is
 * NEVER the default for an unclassified penalty.
 */

import {
  normalizeLie,
  normalizeMiss,
  normalizePenaltyType,
  type Lie,
  type ShotInput,
} from './types';

// -----------------------------------------------------------------------------
// Constants — the canonical corridor viewBox + fairway taper
// -----------------------------------------------------------------------------

export const VB = { width: 100, height: 200 } as const;

/** Fairway taper — used ONLY to bound lateral (X) drift at a given Y, not
 *  to derive Y itself (Y comes straight from `TEE`/`PIN`, see `projectY`). */
const FAIRWAY = {
  centerX: 50,
  halfWidthTee: 9,
  halfWidthGreen: 7,
  topY: 24,
  bottomY: 178,
} as const;

const TEE = { x: 50, y: 188 } as const;
const PIN = { x: 50, y: 14 } as const;

/** Stylized lateral step for one shot's miss, in corridor viewBox units. */
const MISS_OFFSET_PER_STEP = 11;
/** Stylized center drift for a "straight" (no left/right) miss. */
const STRAIGHT_DRIFT = 2;
/** How far outside the tapered fairway a miss may still push the endpoint
 *  before clamping — the "rough band" the endpoint is bounded inside. */
const ROUGH_MARGIN = 23;
/** Multiplier applied when this shot's miss direction matches the previous
 *  shot's — makes a run of same-direction misses read as progressively
 *  wider, not just linearly additive. */
const STREAK_AMPLIFY = 1.3;
/** Multiplier applied to the lateral nudge when the shot is a penalty. */
const PENALTY_WIDEN = 1.5;

/** Arc-lift tuning for the Bezier "ball flight" control point — sized from
 *  the shot's REAL yardage (converted to corridor pixels), not the raw
 *  Euclidean pixel distance between endpoints (which mixes in the stylized
 *  lateral offset and would misrepresent shot length). */
const ARC_LIFT_FACTOR = 0.09;
const MAX_ARC_LIFT = 14;

// Green inset — own coordinate space, feet-scale, auto-fit per hole.
export const GREEN_INSET_VB = { width: 100, height: 100 } as const;
const GREEN_INSET_PIN = { x: 50, y: 50 } as const;
const GREEN_INSET_BOUNDARY_RADIUS_UNITS = 46;
/** A shot with no logged `lie_after === 'green'` still qualifies for the
 *  inset when it finished this close (yards) to the pin — short-game shots
 *  suffer the same "collapses to 2px" problem putts do. Widened from the
 *  original 10y so a 12-15y short-sided chip (inside a normal short-siding
 *  range, but previously just outside the cutoff) doesn't collapse in the
 *  corridor with no inset escape hatch. */
const GREEN_INSET_YARDS_THRESHOLD = 18;
const GREEN_INSET_PADDING_FACTOR = 1.25;
const GREEN_INSET_MIN_DISPLAY_FEET = 8;
const GREEN_INSET_MAX_DISPLAY_FEET = 45;
/** Used only when a hole has zero inset shots — the inset's `shots` array
 *  is empty in that case, so this only sizes an otherwise-unused frame. */
const GREEN_INSET_DEFAULT_DISPLAY_FEET = 20;
const GREEN_INSET_ARC_LIFT_FACTOR = 0.5;
const GREEN_INSET_MAX_ARC_LIFT = 8;
/** Angular step (radians) applied for a left/right putt miss — the inset's
 *  polar analogue of the corridor's `MISS_OFFSET_PER_STEP`. ~40°. */
const GREEN_INSET_ANGLE_STEP = (Math.PI / 180) * 40;
/** Angular drift (radians) for a straight/long/short/unlogged miss — the
 *  inset's polar analogue of `STRAIGHT_DRIFT`. ~9°. */
const GREEN_INSET_ANGLE_CENTER_DRIFT = (Math.PI / 180) * 9;
/** Cumulative angle is clamped to this band so a long run of same-direction
 *  misses can't wrap a shot around to the "far side" of the pin, which
 *  would read as nonsensical. ~153°, well short of a half-wrap. */
const GREEN_INSET_MAX_CUMULATIVE_ANGLE = Math.PI * 0.85;
/** Minimum radial gap (inset units) between two shots' TRUE radii — or
 *  between the innermost shot and the pin itself — before the
 *  collision-resolve pass nudges one of them angularly. Sized from the
 *  rendered dot's own footprint (`PuttingZoom.tsx` draws putt dots at
 *  r≈2.5-3 plus a +0.8 ring, ~6-8 units across), so a gap under this
 *  reliably means two dots would visually overlap if left at their
 *  "natural" angle. */
export const GREEN_INSET_MIN_RADIAL_GAP_UNITS = 6;

/** Mirrors `PuttingZoom.tsx`'s largest dot ring that can ever sit exactly AT
 *  the origin — a holed putt always renders with the "made" treatment
 *  (`r = 3.1` + the `+0.8` outer ring = 3.9). A holed putt's own
 *  `true_radius_units` is always exactly 0 (see below), so this is the full
 *  footprint `GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS` must clear — bigger
 *  than (and so safely covers) the plain pin glyph alone, which
 *  `PuttingZoom.tsx` draws at a smaller `r="2.3"` for a hole with no holed
 *  putt this round (e.g. a picked-up ball). geometry.ts doesn't import the
 *  renderer — this is a documented mirror, the same pattern
 *  `GREEN_INSET_MIN_RADIAL_GAP_UNITS`'s own doc already uses citing
 *  rendered dot footprints. */
const GREEN_INSET_HOLED_DOT_RING_RADIUS_UNITS = 3.9; // isMade r(3.1) + ring(+0.8)

/** Mirrors `PuttingZoom.tsx`'s largest dot ring a FLOORED (non-holed) shot
 *  can itself carry — the "unresolved" (picked-up/conceded final putt)
 *  treatment, `r = 3` + the `+0.8` outer ring = 3.8, the biggest non-made
 *  footprint. */
const GREEN_INSET_FLOORED_DOT_RING_RADIUS_UNITS = 3.8; // isUnresolved r(3) + ring(+0.8)

/** Minimum display radius (inset units) a NON-holed shot's rendered
 *  position is floored to when its TRUE radius is small enough that its
 *  own ring would overlap whatever occupies the origin — see the module
 *  doc's GREEN INSET MIN-SEPARATION section. Derived, not eyeballed: the
 *  origin's worst-case footprint + this shot's own worst-case footprint +
 *  a fixed clearance margin (comfortably less than the ~12-unit radius a
 *  genuinely well-separated shot already sits at in practice, so this
 *  floor only ever fires for shots that actually need it — see
 *  `HoleShotPath.test.ts`'s "does NOT nudge" coverage). `true_radius_units`
 *  is NEVER set to this value — only the rendered `x`/`y` position is; the
 *  leader tick still discloses the true (smaller) radius. */
export const GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS =
  GREEN_INSET_HOLED_DOT_RING_RADIUS_UNITS + GREEN_INSET_FLOORED_DOT_RING_RADIUS_UNITS + 2; // 3.9 + 3.8 + 2 = 9.7

/** Worst-case combined ring width for two NON-holed shots fanning apart at
 *  the same (or nearly the same) display radius — both treated as the
 *  larger `GREEN_INSET_FLOORED_DOT_RING_RADIUS_UNITS` footprint for
 *  symmetry (the true worst case, one "unresolved" + one ordinary miss, is
 *  smaller: 3.8 + 3.3). Used only by `insetFanAngleStep` below. */
const GREEN_INSET_FAN_CLEARANCE_UNITS = GREEN_INSET_FLOORED_DOT_RING_RADIUS_UNITS * 2; // 7.6

/** The angular step (radians) between two points at radii `radius` and
 *  `neighborRadius` that separates them by exactly
 *  `GREEN_INSET_FAN_CLEARANCE_UNITS` of straight-line distance. Computed
 *  dynamically (law of cosines) rather than a fixed degree constant for two
 *  reasons: (1) linear separation from a fixed angle shrinks with radius
 *  (arc length ≈ radius × angle for a single circle) — exactly backwards
 *  for the near-pin floor case this fix exists for, where radius is small
 *  by construction; (2) a floored dot and its next-out neighbor are USUALLY
 *  at two DIFFERENT radii (the floor only pins the inner one), so the
 *  simpler same-circle chord formula (2·r·sin(Δθ/2)) systematically
 *  undershoots — this solves the actual triangle:
 *    target² = r1² + r2² − 2·r1·r2·cos(Δθ)  →  Δθ = acos((r1²+r2²−target²)/(2·r1·r2))
 *  Both radii are always `GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS` or larger
 *  by the time this is called (either a shot's own true radius already
 *  clears the floor, or it was floored to exactly that constant), so the
 *  ratio below never exceeds 1 (acos domain-safe) in practice; the clamp
 *  is defensive only. */
function insetFanAngleStep(radius: number, neighborRadius: number): number {
  const r1 = Math.max(neighborRadius, 0.5);
  const r2 = Math.max(radius, 0.5);
  const target = GREEN_INSET_FAN_CLEARANCE_UNITS;
  const cosDelta = clamp((r1 * r1 + r2 * r2 - target * target) / (2 * r1 * r2), -1, 1);
  return Math.acos(cosDelta);
}

// -----------------------------------------------------------------------------
// Public output shapes
// -----------------------------------------------------------------------------

export interface PlottedShot {
  shot_number: number;
  /** 1-based position within this hole (1, 2, 3…). Use this for any
   *  UI label — the raw `shot_number` from the DB may be round-wide
   *  or synthetic depending on the data source. */
  display_index: number;
  /** Endpoint position in the canonical corridor viewBox (`VB`). For a
   *  symbolic (penalty) shot, this is its START position, not a
   *  fabricated flight endpoint — see the module doc. */
  x: number;
  y: number;
  /** Where the ball ended up (canonical Lie or 'other'). */
  lie: Lie | 'other';
  /** Distance to pin AFTER this shot, in yards, unit-normalized, verbatim
   *  from the ledger (null when unlogged — never invented). Kept for
   *  backward compatibility; identical to `remaining_yards`. */
  distance_to_pin: number | null;
  /** Same value as `distance_to_pin` — the name the geometry contract
   *  spells out explicitly. */
  remaining_yards: number | null;
  /** True when this shot was logged as a penalty. */
  is_penalty: boolean;
  /** True when this shot's plotted position/segment is SYMBOLIC — no real
   *  flight to draw, no numbered flight dot to plant at a fabricated
   *  endpoint. Today this is always identical to `is_penalty` (the only
   *  symbolic case the ledger produces), kept as its own field so a
   *  renderer's "draw a +1 marker, not a flight dot" branch has a single,
   *  purpose-named flag to key off rather than overloading `is_penalty`
   *  (which stays the rules/scoring fact). */
  symbolic: boolean;
  /** Useful for tooltips — what the player keyed in. Long/short passes
   *  through exactly like left/right — it's an along-axis miss a renderer
   *  can key a distinct glyph off directly (the real Y position already
   *  carries the honest along-axis signal; this field just names which
   *  direction so the glyph orientation is correct). */
  miss_direction: 'left' | 'right' | 'long' | 'short' | null;
  /** Real yardage of this shot itself (start→end). Prefers the logged
   *  `shot_distance` column when present; otherwise the delta of
   *  unit-normalized before/after distances. Null when neither is
   *  computable, OR when this is a symbolic (penalty) shot — a penalty
   *  never gets a fabricated `0`/"<1 yd" length. Never invented. */
  shot_yards: number | null;
  /** True when this shot also appears in `PlottedHole.greenInset.shots`. */
  in_green_inset: boolean;
  /** Tooltip-only pass-through fields — no effect on geometry. */
  club_type?: ShotInput['club_type'];
  penalty_type?: ShotInput['penalty_type'];
  putt_break?: ShotInput['putt_break'];
  putt_slope?: ShotInput['putt_slope'];
  notes?: ShotInput['notes'];
  /** Per-shot Strokes Gained, copied verbatim from the input — geometry
   *  never computes SG itself (see `ShotInput.sg`'s doc for the canonical
   *  calculator). */
  sg?: ShotInput['sg'];
  putt_made?: ShotInput['putt_made'];
  miss_tags?: ShotInput['miss_tags'];
  estimated_break_inches?: ShotInput['estimated_break_inches'];
}

export interface PlottedSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Quadratic Bezier control point — gives the line a subtle arc
   *  suggesting ball flight, sized from the real shot yardage when known. */
  control: { x: number; y: number };
  /** Lie the ball ENDED in — colors the segment leaving the previous
   *  endpoint (i.e. "you went into rough — the line dimming reflects
   *  the consequence of the prior shot"). */
  to_lie: Lie | 'other';
  /** Index of the destination shot — for corridor segments, an index into
   *  `PlottedHole.shots`; for inset segments, an index into
   *  `PlottedGreenInset.shots`. Used for stable render keys. */
  to_index: number;
}

export interface PlottedHazard {
  /** `water`/`sand`/`rough` reconstruct from the shot's `lie_after`.
   *  `ob`/`unplayable`/`penalty` are penalty-only glyphs, branched off
   *  `penalty_type` — see the module doc's HAZARDS section. `ob` covers
   *  BOTH `ob` and `lost` penalty types (neither is a water event, and the
   *  distinction between "went out of bounds" and "couldn't find it" isn't
   *  visually load-bearing enough to earn its own glyph). `penalty` is the
   *  generic fallback for `is_penalty: true` with no (or an unrecognized)
   *  `penalty_type` — it must NEVER be `water` by default. */
  kind: 'sand' | 'rough' | 'water' | 'ob' | 'unplayable' | 'penalty';
  /** Hazard center, in corridor viewBox units. */
  x: number;
  y: number;
  /** Approximate radius (viewBox units). */
  r: number;
  /** Source shot's number — useful for keys + a11y descriptions. */
  origin_shot: number;
}

/** A single ruler mark along the corridor's yardage axis. */
export interface YardageTick {
  /** Yards remaining to the pin this tick marks. */
  yards: number;
  /** Y position in the corridor viewBox (`VB`). */
  y: number;
  /** True for the 50/100/150 "sprinkler head" markers golfers read at a
   *  glance — emphasized regardless of the hole's total yardage. */
  emphasis: boolean;
}

/** A single ruler mark along the green inset's feet axis. */
export interface GreenInsetTick {
  /** Feet from the pin this ruler line marks. */
  feet: number;
  /** Y position in the inset's own coordinate space (`GREEN_INSET_VB`). */
  y: number;
}

export interface PlottedInsetShot {
  /** Index into the parent `PlottedHole.shots` array — lets a consumer
   *  cross-reference the full tooltip data (club, notes, penalty, SG,
   *  putt_made, miss_tags, estimated_break_inches…). */
  shot_index: number;
  shot_number: number;
  display_index: number;
  /** Position in the inset's own coordinate space (`GREEN_INSET_VB`), AFTER
   *  the min-separation collision-resolve pass — see the module doc's
   *  GREEN INSET MIN-SEPARATION section. May differ from the position
   *  `true_radius_units` alone would imply in TWO ways, independently or
   *  combined: (1) radius floored outward to
   *  `GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS` when the true radius was too
   *  close to the origin for an angle nudge to ever help, and/or (2) angle
   *  nudged away from the natural miss-direction-seeded angle to fan apart
   *  from a crowded neighbor. `true_radius_units` below is the ALWAYS-honest
   *  value regardless of either. */
  x: number;
  y: number;
  lie: Lie | 'other';
  /** Distance to pin AFTER this shot, in feet, unit-normalized, verbatim
   *  from the ledger (null when unlogged). */
  remaining_feet: number | null;
  /** Real length of this shot in feet — delta from the previous inset
   *  shot's `remaining_feet` when both are known; otherwise this shot's
   *  own corridor-scale `shot_yards` converted to feet (true for the
   *  first inset shot on a hole, which has no previous inset point to
   *  diff against — e.g. an approach that reaches the green). Null when
   *  neither is computable, OR when this is a symbolic (penalty) shot —
   *  never invented, and never a fabricated `0` for a penalty. */
  shot_feet: number | null;
  /** This shot's TRUE distance from the inset pin, in inset-viewBox units,
   *  derived from `remaining_feet` (or a documented positional-only
   *  fallback when that's unlogged). NEVER altered by the collision-resolve
   *  pass — `x`/`y` above may be drawn farther out (see the floor, above),
   *  but this field is always the honest number the leader tick discloses,
   *  and relative distance ordering between any two inset shots (by THIS
   *  field) is always preserved. */
  true_radius_units: number;
  /** True when this shot was moved away from its natural resting position
   *  by the min-separation pass — radially (the floor pushed it outward
   *  past its true radius), angularly (fanned apart from a crowded
   *  neighbor), or both. A renderer can use this to draw a short leader
   *  tick disclosing the move — `true_radius_units` above is still the
   *  shot's exact honest distance regardless. */
  leader: boolean;
  /** Mirrors `PlottedShot.symbolic` — true for a penalty stroke plotted
   *  here (no real advancement to draw a flight segment for). */
  symbolic: boolean;
}

export interface PlottedGreenInset {
  /** The inset's own coordinate system — wholly independent of `VB`. */
  vb: typeof GREEN_INSET_VB;
  pin: { x: number; y: number };
  /** Feet-scale shots that plot inside the green (putts + very short
   *  shots). Empty when nothing on this hole qualifies. */
  shots: PlottedInsetShot[];
  /** Segments connecting consecutive inset shots, same Bezier shape as the
   *  corridor's `PlottedSegment`, in inset coordinates. Skips symbolic
   *  (penalty) shots — same "no fabricated flight" rule as the corridor. */
  segments: PlottedSegment[];
  /** Labeled distance rulers — the thing that makes the inset's scale
   *  checkable rather than a "trust me" zoom. */
  ticks: GreenInsetTick[];
  /** The circular frame around the inset. A RENDERING AID sized from the
   *  real max on-green distance this hole (+ padding) — NOT a claim about
   *  the true green's physical dimensions (no course geometry exists). */
  boundary: { cx: number; cy: number; r: number };
  /** Feet represented by one inset coordinate unit — lets a consumer
   *  compute exact pixel-per-foot without re-deriving the scale. */
  feet_per_unit: number;
  /** Index into `PlottedHole.shots` of the last shot BEFORE the ball
   *  entered the green — lets a consumer draw a connector from the
   *  corridor into the inset. `null` when the very first shot on the hole
   *  is already inset-eligible (e.g. a hole-in-one) or no shot is inset. */
  entry_shot_index: number | null;
}

export interface PlottedHole {
  total_yardage: number;
  tee: { x: number; y: number };
  pin: { x: number; y: number };
  shots: PlottedShot[];
  /** Segments connecting consecutive shots. Skips symbolic (penalty)
   *  shots — same "no fabricated flight" rule documented in the module
   *  doc — so this array can be SHORTER than `shots`. */
  segments: PlottedSegment[];
  hazards: PlottedHazard[];
  /** Corridor yardage ruler — draw this to make the true-to-scale axis
   *  visible rather than merely asserted. */
  ticks: YardageTick[];
  /** Scale-accurate green detail plot. Always present; `shots` is an
   *  empty array when nothing on this hole qualifies for it. */
  greenInset: PlottedGreenInset;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Convert a raw `distance_to_hole_before/after` value to yards. The LIE is
 *  the primary signal (a green lie means the row is FEET, full stop — see
 *  the module doc's UNIT HANDLING section for why this matches every other
 *  read path in the app); the explicit `distance_unit_*` tag is consulted
 *  only when the lie ISN'T green, and only an explicit `'feet'` flips it —
 *  absent/unknown values default to yards, the DB column default. */
function toHoleYards(value: number, unit: string | null | undefined, lieIsGreen: boolean): number {
  if (lieIsGreen) return value / 3;
  return unit === 'feet' ? value / 3 : value;
}

/** Convert a raw `shot_distance` value to yards. Unlike distance-to-hole,
 *  `shot_distance` is a DESIGN GUARANTEE always-yards column — never
 *  lie-dependent — so only the explicit unit tag can flip it to feet. */
function toShotYards(value: number, unit: string | null | undefined): number {
  return unit === 'feet' ? value / 3 : value;
}

/** Deterministic pseudo-random sign in {-1, 1} from an integer seed — a
 *  pure function of the shot's own id, NEVER `Math.random()`. Used only
 *  for small stylized tie-breaks (which way a dead-straight shot drifts,
 *  which way a min-separation collision gets nudged); never for anything
 *  that changes a displayed number. */
function seededSign(seed: number): 1 | -1 {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = x - Math.floor(x);
  return frac < 0.5 ? -1 : 1;
}

/**
 * Infer the hole's total yardage. Priority:
 *   1. explicit `yardage` argument
 *   2. shot 1's `distance_to_hole_before`
 *   3. par-based fallback
 *   4. final fallback: 360y
 *
 * NOTE: `shots` must already be sorted by `shot_number` ascending — the
 * caller (`plotHole`) guarantees this. A hole's genuine first shot is
 * essentially always a `lie_before` of `'tee'`/`null` (never `'green'`),
 * but the before-distance is still run through the same lie-aware
 * conversion as every other distance in this module for consistency and
 * defensiveness against unusual ledgers (e.g. a resumed/partial hole).
 */
export function inferHoleYardage(
  shots: ShotInput[],
  par: number | undefined,
  yardage: number | null | undefined,
): number {
  if (typeof yardage === 'number' && yardage > 0) return yardage;
  const first = shots[0];
  const fromShotRaw = first?.distance_to_hole_before;
  if (typeof fromShotRaw === 'number' && Number.isFinite(fromShotRaw) && fromShotRaw > 0) {
    const fromShot = toHoleYards(
      fromShotRaw,
      first?.distance_unit_before,
      normalizeLie(first?.lie_before) === 'green',
    );
    if (fromShot > 0) return fromShot;
  }
  if (par === 3) return 175;
  if (par === 4) return 380;
  if (par === 5) return 525;
  return 360;
}

/** Map a yards-to-pin value onto the corridor's Y axis, STRICTLY linear
 *  across the full tee→pin span:
 *    yards = 0            → y = PIN.y
 *    yards = totalYardage → y = TEE.y  */
function projectY(yardsToPin: number, totalYardage: number): number {
  const t = clamp(yardsToPin / Math.max(1, totalYardage), 0, 1);
  return PIN.y + t * (TEE.y - PIN.y);
}

/** Corridor half-width (viewBox units) at a given Y, tapering from the tee
 *  width to the green width. Used only to bound lateral drift. */
function corridorHalfWidthAtY(y: number): number {
  const t = clamp((FAIRWAY.bottomY - y) / (FAIRWAY.bottomY - FAIRWAY.topY), 0, 1);
  return FAIRWAY.halfWidthTee + t * (FAIRWAY.halfWidthGreen - FAIRWAY.halfWidthTee);
}

/** Maximum lateral offset (one direction) at a given Y — the corridor
 *  half-width plus a rough band. */
function maxLateralAtY(y: number): number {
  return corridorHalfWidthAtY(y) + ROUGH_MARGIN;
}

/**
 * Shared step function used by the corridor's lateral offset AND the
 * green inset's angular offset (unit-agnostic — the caller decides
 * whether `step`/`centerDrift` mean viewBox pixels or radians). Left/right
 * misses get a fixed step; a "straight"/long/short miss gets a small
 * deterministic center drift. Consecutive same-direction misses amplify;
 * penalties widen further.
 */
function lateralDelta(
  miss: 'left' | 'right' | 'long' | 'short' | null,
  seed: number,
  step: number,
  centerDrift: number,
  streak: boolean,
  isPenalty: boolean,
): number {
  let base: number;
  if (miss === 'left') base = -step;
  else if (miss === 'right') base = step;
  else base = seededSign(seed) * centerDrift;
  if (streak) base *= STREAK_AMPLIFY;
  if (isPenalty) base *= PENALTY_WIDEN;
  return base;
}

/** Every 50y, with the 50/100/150 "sprinkler head" markers emphasized —
 *  the ruler that makes the corridor's linear-in-yards claim visible. */
function computeYardageTicks(totalYardage: number): YardageTick[] {
  if (!(totalYardage > 0)) return [];
  const MAX_TICK_YARDAGE = 800; // defensive cap against corrupted yardage
  const cap = Math.min(totalYardage, MAX_TICK_YARDAGE);
  const step = 50;
  const ticks: YardageTick[] = [];
  for (let n = 0; n * step <= cap; n++) {
    const yards = n * step;
    ticks.push({
      yards,
      y: projectY(yards, totalYardage),
      emphasis: yards === 50 || yards === 100 || yards === 150,
    });
  }
  return ticks;
}

/** The green inset's own ruler — feet increments chosen from the auto-fit
 *  display scale so a tiny green-in-regulation hole doesn't get 1ft ticks
 *  and a 40-footer doesn't get 5ft ticks crowding the frame. */
function computeGreenInsetTicks(displayFeet: number, feetPerUnit: number): GreenInsetTick[] {
  if (!(displayFeet > 0) || !(feetPerUnit > 0)) return [];
  const step = displayFeet <= 15 ? 5 : displayFeet <= 30 ? 10 : 15;
  const ticks: GreenInsetTick[] = [];
  for (let n = 1; n * step <= displayFeet + 0.001; n++) {
    const feet = n * step;
    ticks.push({ feet, y: GREEN_INSET_PIN.y - feet / feetPerUnit });
  }
  return ticks;
}

/** Pass-1 per-shot normalization — unit conversion + inset eligibility,
 *  with no positional/state dependency on sibling shots. Kept separate
 *  from the main forward loop so the green inset's auto-fit scale can be
 *  computed from ALL shots before any position is plotted. */
interface NormalizedShot {
  lie: Lie | 'other';
  miss: 'left' | 'right' | 'long' | 'short' | null;
  /** Distance to pin BEFORE this shot, in yards — the shot's START
   *  position. Used to position a symbolic (penalty) shot, which has no
   *  honest "after" flight position to plot from. */
  before_yards: number | null;
  after_yards: number | null;
  after_feet: number | null;
  shot_yards: number | null;
  in_green_inset: boolean;
}

function normalizeShot(s: ShotInput): NormalizedShot {
  const lie = normalizeLie(s.lie_after);
  const lieBefore = normalizeLie(s.lie_before);
  const miss = normalizeMiss(s.miss_direction);

  const beforeRaw = s.distance_to_hole_before;
  const afterRaw = s.distance_to_hole_after;
  const before_yards =
    typeof beforeRaw === 'number' && Number.isFinite(beforeRaw)
      ? toHoleYards(beforeRaw, s.distance_unit_before, lieBefore === 'green')
      : null;
  const after_yards =
    typeof afterRaw === 'number' && Number.isFinite(afterRaw)
      ? toHoleYards(afterRaw, s.distance_unit_after, lie === 'green')
      : null;
  const after_feet = after_yards !== null ? after_yards * 3 : null;

  let shot_yards: number | null = null;
  if (typeof s.shot_distance === 'number' && Number.isFinite(s.shot_distance)) {
    shot_yards = Math.max(0, toShotYards(s.shot_distance, s.distance_unit));
  } else if (before_yards !== null && after_yards !== null) {
    shot_yards = Math.max(0, before_yards - after_yards);
  }

  const isGreenLie = lie === 'green';
  const isShortDistance = after_yards !== null && after_yards <= GREEN_INSET_YARDS_THRESHOLD;
  const in_green_inset = isGreenLie || isShortDistance;

  return { lie, miss, before_yards, after_yards, after_feet, shot_yards, in_green_inset };
}

/** One not-yet-finalized green-inset entry — carries everything needed to
 *  run the min-separation collision-resolve pass (§ GREEN INSET
 *  MIN-SEPARATION in the module doc) AFTER all of a hole's inset shots are
 *  known, before committing to final x/y. */
interface InsetWorkItem {
  shot_index: number;
  shot_number: number;
  display_index: number;
  lie: Lie | 'other';
  remaining_feet: number | null;
  shot_feet: number | null;
  true_radius_units: number;
  base_angle: number;
  symbolic: boolean;
}

/** Resolve the green inset's min-separation pass — radial floor + angular
 *  fan, combined (see the module doc's GREEN INSET MIN-SEPARATION
 *  section). Sorts by TRUE radius ascending (ties broken by shot_number
 *  for determinism) and walks outward from the pin. Returns a Map from
 *  `shot_index` to the resolved `{ radius, angle, leader }`:
 *
 *   - `radius` is `max(true_radius_units, GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS)`
 *     for a non-holed item — the ONLY place this module ever draws a shot
 *     away from its true radius. Because it's `max()` against one fixed
 *     constant (never a chained/accumulated value), it's monotonic in
 *     `true_radius_units`: processing in true-radius-ascending order can
 *     never invert two shots' display order (a smaller true radius can tie
 *     a larger one at the floor, never exceed it).
 *   - `angle` nudges away from `base_angle` whenever this item's resolved
 *     `radius` gap to the PREVIOUS item's own resolved `radius` (or to the
 *     pin itself, for the innermost non-holed item) is under
 *     `GREEN_INSET_MIN_RADIAL_GAP_UNITS` — same trigger condition as
 *     before, now correctly evaluated against the post-floor radius so a
 *     floored item still participates in fan-apart with its neighbors.
 *     The nudge itself uses `insetFanAngleStep(radius)` (dynamic, not a
 *     fixed degree constant — see its own doc) scaled by how deep into a
 *     crowded cluster this item sits, so a long chain (3+ shots within the
 *     gap) still fans out distinctly.
 *   - `leader` is true whenever EITHER happened — the shot was drawn away
 *     from its true radius, fanned in angle, or both.
 *
 *  A shot at EXACTLY radius 0 (a holed putt, definitionally at the pin) is
 *  always exempt from both — it's correctly at the pin, not colliding with
 *  it, and neither mechanism has anything to do there (the floor only
 *  applies to non-holed shots; an angle nudge at r=0 can't move the point
 *  at all, since sin/cos scale by the radius). The "or the pin" collision
 *  case for everything else is exactly the bug this floor fixes: a
 *  near-zero (but not exactly zero) radius is genuinely close enough to
 *  overlap the pin glyph's — or a holed dot's own — rendered footprint,
 *  and angle alone is powerless to fix that. */
function resolveInsetGeometry(
  items: readonly InsetWorkItem[],
): Map<number, { radius: number; angle: number; leader: boolean }> {
  const resolved = new Map<number, { radius: number; angle: number; leader: boolean }>();
  const sorted = [...items].sort(
    (a, b) => a.true_radius_units - b.true_radius_units || a.shot_number - b.shot_number,
  );
  let prevRadius = 0; // the pin itself is the innermost "neighbor"
  let prevAngle = 0; // meaningless until the first non-holed item sets it below
  let clusterDepth = 0;
  let clusterSign: 1 | -1 = 1; // fixed for the whole run of a cluster — see below
  for (const item of sorted) {
    if (item.true_radius_units <= 0) {
      resolved.set(item.shot_index, { radius: 0, angle: item.base_angle, leader: false });
      prevRadius = 0;
      clusterDepth = 0;
      continue;
    }

    // Radial floor — never moves a shot INWARD, only ever outward from its
    // true radius, and only when that true radius is too close to the
    // origin for an angle nudge to ever separate it. `true_radius_units`
    // itself (on `InsetWorkItem`/the final `PlottedInsetShot`) is untouched.
    // Since the floor always exceeds `GREEN_INSET_MIN_RADIAL_GAP_UNITS`, the
    // very first non-holed item in the walk (comparing against `prevRadius
    // = 0`, the origin) never trips the angular-fan branch below on its
    // own — the floor alone is what clears the origin; angular fanning only
    // ever engages between two REAL (non-holed) items.
    const radius = Math.max(item.true_radius_units, GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS);
    const radiusFloored = radius !== item.true_radius_units;

    // Angular fan — same gap trigger as before, now against the resolved
    // (possibly-floored) radius so cascading crowding (a neighbor pushed
    // outward by the floor can newly crowd the NEXT shot out) is caught.
    // Chains off the PREVIOUS item's own RESOLVED angle (not this item's
    // natural base_angle) — nudging relative to one's own seed is only a
    // guaranteed separation if the neighbor's angle happens to differ by
    // more than the nudge itself; two shots can have near-identical
    // miss-direction-seeded base angles (e.g. both logged "straight"), in
    // which case a self-relative nudge could land right back on top of the
    // neighbor. Anchoring to the neighbor's actual resolved angle instead
    // guarantees at least `insetFanAngleStep(radius)` of true separation
    // between any two ADJACENT (in true-radius order) members of a cluster.
    // For a 3+ deep cluster, EVERY member reuses the SAME `clusterSign` —
    // fixed once when the cluster starts, not re-rolled per item — so the
    // fan only ever winds in one rotational direction; a per-item sign
    // could otherwise wind out and back (e.g. +Δθ then −Δθ), landing a
    // non-adjacent pair (item 1 and item 3 of the same cluster) right back
    // on top of each other despite each adjacent pair individually
    // clearing. A one-directional wind makes every pair's separation the
    // SUM of the per-step angles between them — monotonically more than
    // any single step, never less.
    // Trigger threshold is the STRICTER (larger) of the two gap constants
    // in play: `GREEN_INSET_MIN_RADIAL_GAP_UNITS` (the original heuristic)
    // and `GREEN_INSET_FAN_CLEARANCE_UNITS` (what the fan below actually
    // guarantees). If the raw radius gap already meets the larger one, the
    // two shots are provably safe even in the worst case (same angle, zero
    // separation) — Euclidean distance between two same-angle points is
    // exactly their radius difference. Using the smaller constant alone
    // could pass a pair through un-nudged with a gap that's enough by ONE
    // definition but not the other (e.g. 6.0–7.6, `GREEN_INSET_FAN_
    // CLEARANCE_UNITS`'s own worst-case dot-footprint width).
    const gap = radius - prevRadius;
    const gapThreshold = Math.max(GREEN_INSET_MIN_RADIAL_GAP_UNITS, GREEN_INSET_FAN_CLEARANCE_UNITS);
    let angle = item.base_angle;
    let angleNudged = false;
    if (gap < gapThreshold) {
      if (clusterDepth === 0) {
        clusterSign = seededSign(item.shot_number * 13);
      }
      clusterDepth += 1;
      angle = prevAngle + clusterSign * insetFanAngleStep(radius, prevRadius);
      angleNudged = true;
    } else {
      clusterDepth = 0;
    }

    resolved.set(item.shot_index, { radius, angle, leader: radiusFloored || angleNudged });
    prevRadius = radius;
    prevAngle = angle;
  }
  return resolved;
}

// -----------------------------------------------------------------------------
// The main plotter
// -----------------------------------------------------------------------------

export function plotHole(args: {
  shots: ShotInput[];
  par?: 3 | 4 | 5;
  yardage?: number | null;
}): PlottedHole {
  const ordered = [...args.shots].sort((a, b) => a.shot_number - b.shot_number);
  // Inferred from the SORTED list — `args.shots` isn't guaranteed to arrive
  // in shot_number order, and "shot 1's before-distance" only means
  // anything once it actually is shot 1.
  const total_yardage = inferHoleYardage(ordered, args.par, args.yardage);
  const normalized = ordered.map(normalizeShot);

  // Auto-fit the green inset's scale from the real max on-green distance —
  // sizes the RENDERING frame only, never a displayed number.
  let maxInsetFeet = 0;
  let anyInsetKnownDistance = false;
  for (const n of normalized) {
    if (n.in_green_inset && n.after_feet !== null) {
      anyInsetKnownDistance = true;
      if (n.after_feet > maxInsetFeet) maxInsetFeet = n.after_feet;
    }
  }
  const displayFeet = anyInsetKnownDistance
    ? clamp(
        maxInsetFeet * GREEN_INSET_PADDING_FACTOR,
        GREEN_INSET_MIN_DISPLAY_FEET,
        GREEN_INSET_MAX_DISPLAY_FEET,
      )
    : GREEN_INSET_DEFAULT_DISPLAY_FEET;
  const feet_per_unit = displayFeet / GREEN_INSET_BOUNDARY_RADIUS_UNITS;

  const plotted: PlottedShot[] = [];
  const segments: PlottedSegment[] = [];
  const hazards: PlottedHazard[] = [];
  const insetWork: InsetWorkItem[] = [];

  let cumulativeX: number = TEE.x;
  let prevMiss: 'left' | 'right' | 'long' | 'short' | null = null;
  let prev: { x: number; y: number } = { x: TEE.x, y: TEE.y };
  const pixelsPerYard = total_yardage > 0 ? (TEE.y - PIN.y) / total_yardage : 0;

  let insetCumulativeAngle = 0;
  let insetPrevMiss: 'left' | 'right' | 'long' | 'short' | null = null;
  let prevInsetFeetRef: number | null = null;
  let entry_shot_index: number | null = null;
  let insetCount = 0;

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const n = normalized[i];
    if (!s || !n) continue;

    // ---- Corridor Y: strictly linear in real yards. A symbolic (penalty)
    // shot is positioned from its START (before-distance / previous point),
    // never a fabricated "after" position — see the module doc. Otherwise,
    // graceful degrade to positional interpolation ONLY when the distance
    // itself is unlogged (never a fabricated distance, just a fallback
    // pixel position). ----
    let y: number;
    if (s.is_penalty) {
      y = n.before_yards !== null ? projectY(n.before_yards, total_yardage) : prev.y;
    } else if (n.after_yards !== null) {
      y = projectY(n.after_yards, total_yardage);
    } else {
      const t = (i + 1) / Math.max(1, ordered.length);
      y = TEE.y - t * (TEE.y - PIN.y);
    }

    // ---- Corridor X: stylized miss offset, streak-amplified,
    // penalty-widened, bounded to the corridor + rough band at this Y.
    // Unchanged for symbolic shots — the lateral nudge stays a valid,
    // already-disclosed stylization of "which side," independent of the
    // Y-position fix above. ----
    const streak = n.miss !== null && n.miss === prevMiss;
    const delta = lateralDelta(
      n.miss,
      s.shot_number,
      MISS_OFFSET_PER_STEP,
      STRAIGHT_DRIFT,
      streak,
      !!s.is_penalty,
    );
    cumulativeX = cumulativeX + delta;
    const bound = maxLateralAtY(y);
    cumulativeX = clamp(cumulativeX, FAIRWAY.centerX - bound, FAIRWAY.centerX + bound);
    let x = clamp(cumulativeX, 1, VB.width - 1);
    prevMiss = n.miss;

    // A shot logged at distance-to-pin === 0 is HOLED — not an
    // approximation, the ball's position is definitionally the pin's.
    // Gated to non-penalty shots: a penalty is never "holed" (its Y comes
    // from the before-distance above, not after_yards).
    if (!s.is_penalty && n.after_yards === 0) {
      x = PIN.x;
      y = PIN.y;
    }

    plotted.push({
      shot_number: s.shot_number,
      display_index: i + 1,
      x,
      y,
      lie: n.lie,
      distance_to_pin: n.after_yards,
      remaining_yards: n.after_yards,
      is_penalty: !!s.is_penalty,
      symbolic: !!s.is_penalty,
      miss_direction: n.miss,
      shot_yards: s.is_penalty ? null : n.shot_yards,
      in_green_inset: n.in_green_inset,
      club_type: s.club_type,
      penalty_type: s.penalty_type,
      putt_break: s.putt_break,
      putt_slope: s.putt_slope,
      notes: s.notes,
      sg: s.sg,
      putt_made: s.putt_made,
      miss_tags: s.miss_tags,
      estimated_break_inches: s.estimated_break_inches,
    });

    // Segment from previous endpoint to this one — Bezier control point
    // lift sized from the REAL shot yardage when known. NEVER emitted for
    // a symbolic (penalty) shot — there is no real flight to draw a line
    // for (the old bug: a ~0-length stub reading as "this shot did
    // nothing"). `prev` still advances to this shot's point below, so the
    // NEXT real shot connects from the drop, keeping the sequence honest.
    if (!s.is_penalty) {
      const midX = (prev.x + x) / 2;
      const midY = (prev.y + y) / 2;
      let arcLift: number;
      if (n.shot_yards !== null && pixelsPerYard > 0) {
        arcLift = clamp(n.shot_yards * pixelsPerYard * ARC_LIFT_FACTOR, 0, MAX_ARC_LIFT);
      } else {
        const pixelDistance = Math.hypot(x - prev.x, y - prev.y);
        arcLift = Math.min(MAX_ARC_LIFT, pixelDistance * 0.18);
      }
      const control = { x: midX, y: midY - arcLift };
      segments.push({ from: prev, to: { x, y }, control, to_lie: n.lie, to_index: i });
    }

    // Hazards — unchanged position rule: planted exactly at the endpoint
    // the player logged the ball coming to rest at. Kind branches by
    // penalty_type for a penalty shot — NEVER defaults to water.
    if (n.lie === 'sand') {
      hazards.push({ kind: 'sand', x, y, r: 6.5, origin_shot: s.shot_number });
    } else if (n.lie === 'rough') {
      hazards.push({ kind: 'rough', x, y, r: 8, origin_shot: s.shot_number });
    } else if (s.is_penalty) {
      const pType = normalizePenaltyType(s.penalty_type);
      const kind: PlottedHazard['kind'] =
        pType === 'water'
          ? 'water'
          : pType === 'ob' || pType === 'lost'
            ? 'ob'
            : pType === 'unplayable'
              ? 'unplayable'
              : 'penalty'; // is_penalty with no/unrecognized penalty_type — never water
      hazards.push({ kind, x, y, r: 7, origin_shot: s.shot_number });
    } else if (n.lie === 'water') {
      hazards.push({ kind: 'water', x, y, r: 7, origin_shot: s.shot_number });
    }

    prev = { x, y };

    // ---- Green inset: pass 1 — normalize + compute this shot's true
    // radius and base (pre-collision-resolve) angle. Final x/y are
    // deferred to the collision-resolve pass below, which needs every
    // inset shot on this hole known before it can detect crowding. ----
    if (n.in_green_inset) {
      if (insetCount === 0) {
        entry_shot_index = i > 0 ? i - 1 : null;
      }

      const true_radius_units =
        n.after_feet !== null
          ? clamp(n.after_feet / feet_per_unit, 0, GREEN_INSET_BOUNDARY_RADIUS_UNITS)
          : // Missing distance — a graceful POSITIONAL fallback only. The
            // displayed `remaining_feet` stays null; nothing here is a
            // number ever shown to the user.
            GREEN_INSET_BOUNDARY_RADIUS_UNITS * 0.4;

      const streakInset = n.miss !== null && n.miss === insetPrevMiss;
      const angleDelta = lateralDelta(
        n.miss,
        s.shot_number,
        GREEN_INSET_ANGLE_STEP,
        GREEN_INSET_ANGLE_CENTER_DRIFT,
        streakInset,
        !!s.is_penalty,
      );
      insetCumulativeAngle = clamp(
        insetCumulativeAngle + angleDelta,
        -GREEN_INSET_MAX_CUMULATIVE_ANGLE,
        GREEN_INSET_MAX_CUMULATIVE_ANGLE,
      );
      insetPrevMiss = n.miss;

      // Prefer the delta from the previous INSET shot's own remaining_feet
      // (accurate putt-to-putt length). When there isn't one — the ball's
      // first shot inside the green, or a gap where a prior shot's
      // distance wasn't logged — fall back to THIS shot's real corridor
      // length (`shot_yards`, already unit-correct) converted to feet.
      // Still a real logged number, never invented; just expressed at
      // green scale so the inset tooltip isn't stuck at "—" for the
      // approach that reached the green. Forced null for a symbolic
      // (penalty) shot — same "no fabricated distance" rule as the
      // corridor's `shot_yards`.
      const rawShotFeet =
        prevInsetFeetRef !== null && n.after_feet !== null
          ? Math.max(0, prevInsetFeetRef - n.after_feet)
          : n.shot_yards !== null
            ? n.shot_yards * 3
            : null;
      const shot_feet = s.is_penalty ? null : rawShotFeet;

      insetWork.push({
        shot_index: i,
        shot_number: s.shot_number,
        display_index: i + 1,
        lie: n.lie,
        remaining_feet: n.after_feet,
        shot_feet,
        true_radius_units,
        base_angle: insetCumulativeAngle,
        symbolic: !!s.is_penalty,
      });

      prevInsetFeetRef = n.after_feet;
      insetCount++;
    }
  }

  // ---- Green inset: pass 2 — min-separation collision-resolve (radial
  // floor + angular fan — see module doc). `true_radius_units` on the
  // final `PlottedInsetShot` is always `item.true_radius_units`, verbatim;
  // only the DRAW radius (`resolved.radius`) can differ from it. ----
  const resolvedGeometry = resolveInsetGeometry(insetWork);
  const insetShots: PlottedInsetShot[] = insetWork.map((item) => {
    const resolved = resolvedGeometry.get(item.shot_index);
    const drawRadius = resolved?.radius ?? item.true_radius_units;
    const angle = resolved?.angle ?? item.base_angle;
    const leader = resolved?.leader ?? false;
    // Polar → Cartesian. angle=0 is "north" (straight up the inset, i.e.
    // away from the pin toward where shots typically enter the green),
    // positive angle rotates clockwise (toward "right"). `drawRadius` is
    // `true_radius_units` UNLESS the min-separation floor pushed this shot
    // outward — mathematically guaranteed to stay within the boundary
    // circle either way, since both `true_radius_units` (already clamped
    // to it) and `GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS` are well under
    // `GREEN_INSET_BOUNDARY_RADIUS_UNITS`.
    const x = GREEN_INSET_PIN.x + drawRadius * Math.sin(angle);
    const y = GREEN_INSET_PIN.y - drawRadius * Math.cos(angle);
    return {
      shot_index: item.shot_index,
      shot_number: item.shot_number,
      display_index: item.display_index,
      x,
      y,
      lie: item.lie,
      remaining_feet: item.remaining_feet,
      shot_feet: item.shot_feet,
      true_radius_units: item.true_radius_units,
      leader,
      symbolic: item.symbolic,
    };
  });

  // ---- Green inset: pass 3 — segments, in chronological order, from the
  // FINAL (post-resolve) positions. Skips symbolic (penalty) shots — same
  // "no fabricated flight" rule as the corridor — but the chain still
  // advances through them so the next real inset shot connects from the
  // drop. ----
  const insetSegments: PlottedSegment[] = [];
  let prevInsetPoint: { x: number; y: number } | null = null;
  for (let idx = 0; idx < insetShots.length; idx++) {
    const shot = insetShots[idx];
    if (!shot) continue;
    if (!shot.symbolic && prevInsetPoint) {
      const imidX = (prevInsetPoint.x + shot.x) / 2;
      const imidY = (prevInsetPoint.y + shot.y) / 2;
      const iArcLift =
        shot.shot_feet !== null
          ? clamp((shot.shot_feet / feet_per_unit) * GREEN_INSET_ARC_LIFT_FACTOR, 0, GREEN_INSET_MAX_ARC_LIFT)
          : 0;
      insetSegments.push({
        from: prevInsetPoint,
        to: { x: shot.x, y: shot.y },
        control: { x: imidX, y: imidY - iArcLift },
        to_lie: shot.lie,
        to_index: idx,
      });
    }
    prevInsetPoint = { x: shot.x, y: shot.y };
  }

  return {
    total_yardage,
    tee: TEE,
    pin: PIN,
    shots: plotted,
    segments,
    hazards,
    ticks: computeYardageTicks(total_yardage),
    greenInset: {
      vb: GREEN_INSET_VB,
      pin: GREEN_INSET_PIN,
      shots: insetShots,
      segments: insetSegments,
      ticks: computeGreenInsetTicks(displayFeet, feet_per_unit),
      boundary: {
        cx: GREEN_INSET_PIN.x,
        cy: GREEN_INSET_PIN.y,
        r: GREEN_INSET_BOUNDARY_RADIUS_UNITS,
      },
      feet_per_unit,
      entry_shot_index,
    },
  };
}

/** Format a yards value for the segment tooltip ("147 yds"). */
export function formatYards(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n < 1) return '<1 yd';
  return `${Math.round(n)} yd${n >= 2 ? 's' : ''}`;
}

/** Format a feet value for the green-inset tooltip ("6 ft"). */
export function formatFeet(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n < 1) return '<1 ft';
  return `${Math.round(n)} ft`;
}

/** Build the SVG Bezier path "d" for a segment. */
export function segmentPath(seg: PlottedSegment): string {
  return `M ${seg.from.x.toFixed(2)} ${seg.from.y.toFixed(2)} Q ${seg.control.x.toFixed(2)} ${seg.control.y.toFixed(2)} ${seg.to.x.toFixed(2)} ${seg.to.y.toFixed(2)}`;
}

/**
 * ADDITIVE HELPER (flagged per redesign spec, 2026-07-22) — not part of the
 * original geometry contract. Added so the round-review "putting zoom" side
 * panel can visually correspond to where the approach shot ACTUALLY landed
 * in the main corridor track, instead of the green inset's own
 * independently-seeded lateral offset (see `plotHole`'s inset loop above).
 *
 * Returns a ratio in [-1, 1] — how far left/right of the corridor centerline
 * the shot that first reached the green (`greenInset.shots[0]`) landed,
 * expressed as a fraction of the corridor's own half-width. A consumer uses
 * this to bias where it draws that same shot's dot inside the green inset's
 * own coordinate space, so "40 ft left" in the main track reads as visibly
 * left-of-pin in the zoom too. Pure read of already-plotted data — does NOT
 * change `plotHole`'s own inset shot positions or any existing output.
 */
export function greenEntryLateralRatio(
  shots: ReadonlyArray<Pick<PlottedShot, 'x'>>,
  greenInset: Pick<PlottedGreenInset, 'shots'>,
): number {
  const firstInset = greenInset.shots[0];
  const corridorShot = firstInset ? shots[firstInset.shot_index] : undefined;
  if (!corridorShot) return 0;
  const halfWidth = VB.width / 2;
  if (halfWidth <= 0) return 0;
  return clamp((corridorShot.x - halfWidth) / halfWidth, -1, 1);
}

/** Score-to-par string used by the score badge. */
export function scoreToParLabel(score: number | null | undefined, par: number | undefined): string | null {
  if (typeof score !== 'number' || typeof par !== 'number') return null;
  const d = score - par;
  if (d === 0) return 'E';
  if (d === -3) return 'Albatross';
  if (d === -2) return 'Eagle';
  if (d === -1) return 'Birdie';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Double';
  if (d === 3) return 'Triple';
  return d > 0 ? `+${d}` : String(d);
}
