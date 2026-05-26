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

/** Minimum shape the component needs from a `golf_shots` row. */
export interface ShotInput {
  shot_number: number;
  /** Lie the ball ended up in (where this shot's endpoint sits). */
  lie_after: Lie | string | null;
  /** Lie the ball came from (used for the tee marker on shot 1). */
  lie_before?: Lie | string | null;
  /** Distance to the hole AFTER the shot (yards). */
  distance_to_hole_after: number | null;
  /** Distance to the hole BEFORE the shot (yards, optional). */
  distance_to_hole_before?: number | null;
  /** Miss direction the player logged for this shot. */
  miss_direction?: MissDirection | string | null;
  is_penalty?: boolean | null;
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
   *   - 'strip' : ~28×112 px — for the 18-hole at-a-glance grid
   *   - 'card'  : ~140×320 px — inline per-hole in round review
   *   - 'hero'  : ~280×560 px — detail view when a strip is tapped
   */
  size?: 'strip' | 'card' | 'hero';
  /** Optional click handler — strip variant uses this to expand to hero. */
  onClick?: () => void;
  /** Tone of the score chip vs par. */
  className?: string;
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
