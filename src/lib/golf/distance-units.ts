/**
 * distance-units.ts — Canonical distance unit conversion for GolfHelm.
 *
 * DESIGN GUARANTEE: DB storage never changes.
 *   - Shot distances, approach ranges: stored as YARDS (integers)
 *   - Putt distances: stored as FEET (integers) in `putt_distance_feet`
 *     and `distance_to_hole_*` when lie === 'green' / distance_unit === 'feet'
 *   - Meters exist ONLY at the UI display/input boundary.
 *
 * ONE CONVERSION BOUNDARY: All code that touches distance display or distance
 * input MUST go through these helpers. No inline × 0.9144 anywhere.
 *
 * Unit type system:
 *   'yards' — user preference is yards (default); feet used for putts
 *   'meters' — user preference is meters; centimeters NOT used (meters only)
 *
 * Conversion constant (exact, USGA-adopted): 1 yard = 0.9144 metres
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DistancePreference = 'yards' | 'meters';

// What the DB stores for shot records (unchanged by this feature)
export type CanonicalUnit = 'yards' | 'feet';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Exact USGA/SI constant. 1 yard = 0.9144 m. */
const YARDS_TO_METERS = 0.9144;
const FEET_TO_METERS = YARDS_TO_METERS / 3; // 0.3048 m exactly

// ---------------------------------------------------------------------------
// Core conversion: canonical → display
// ---------------------------------------------------------------------------

/**
 * Convert a canonical yards value to a display value in the user's preferred
 * unit. Returns a number — caller formats it with `formatDistanceLabel`.
 *
 * @param yards - Canonical value in yards (as stored in DB)
 * @param pref  - User's display preference
 * @param round - Whether to round to integer (default true for typical display)
 */
export function yardsToDisplay(
  yards: number,
  pref: DistancePreference,
  round = true,
): number {
  const result = pref === 'meters' ? yards * YARDS_TO_METERS : yards;
  return round ? Math.round(result) : result;
}

/**
 * Convert a canonical feet value to a display value in the user's preferred
 * unit.
 *
 * In yards-mode, putts remain in feet (golf convention).
 * In meters-mode, putt feet convert to meters.
 *
 * @param feet - Canonical value in feet (as stored in putt_distance_feet)
 * @param pref - User's display preference
 * @param round - Whether to round to integer (default true)
 */
export function feetToDisplay(
  feet: number,
  pref: DistancePreference,
  round = true,
): number {
  const result = pref === 'meters' ? feet * FEET_TO_METERS : feet;
  return round ? Math.round(result) : result;
}

// ---------------------------------------------------------------------------
// Core conversion: input → canonical (entry boundary only)
// ---------------------------------------------------------------------------

/**
 * Convert a user-entered yards-display value back to canonical yards.
 * Use this at every server-action boundary for non-putt shot distances.
 *
 * @param display - The number the user typed (in their preferred unit)
 * @param pref    - User's active preference
 * @param round   - Whether to round to integer (default true)
 */
export function displayToYards(
  display: number,
  pref: DistancePreference,
  round = true,
): number {
  const result = pref === 'meters' ? display / YARDS_TO_METERS : display;
  return round ? Math.round(result) : result;
}

/**
 * Convert a user-entered display value back to canonical feet.
 * Use this at the server-action boundary for putt distances.
 *
 * In yards-mode, putt entry is still in feet (unchanged behaviour).
 * In meters-mode, putt entry is in meters → convert back to feet.
 *
 * @param display - The number the user typed (feet in yards-mode, meters in meters-mode)
 * @param pref    - User's active preference
 * @param round   - Whether to round to integer (default true)
 */
export function displayToFeet(
  display: number,
  pref: DistancePreference,
  round = true,
): number {
  const result = pref === 'meters' ? display / FEET_TO_METERS : display;
  return round ? Math.round(result) : result;
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

/**
 * Returns the abbreviated unit label for the user's preference in yards context.
 *   yards  → 'yds'
 *   meters → 'm'
 */
export function yardsLabel(pref: DistancePreference): string {
  return pref === 'meters' ? 'm' : 'yds';
}

/**
 * Returns the abbreviated unit label for putt/feet context.
 * In yards-mode, putts display in feet → 'ft'
 * In meters-mode, putts display in meters → 'm'
 */
export function feetLabel(pref: DistancePreference): string {
  return pref === 'meters' ? 'm' : 'ft';
}

/**
 * Returns the uppercase abbreviated unit label (for scorecard/badge context).
 *   yards  → 'YDS'
 *   meters → 'M'
 */
export function yardsLabelUpper(pref: DistancePreference): string {
  return pref === 'meters' ? 'M' : 'YDS';
}

/**
 * Returns the uppercase putt unit label.
 *   yards  → 'FT'
 *   meters → 'M'
 */
export function feetLabelUpper(pref: DistancePreference): string {
  return pref === 'meters' ? 'M' : 'FT';
}

// ---------------------------------------------------------------------------
// Formatted display string (value + unit label)
// ---------------------------------------------------------------------------

/**
 * Returns a fully-formatted distance string for a canonical yards value.
 * Examples:
 *   formatYards(150, 'yards') → '150 yds'
 *   formatYards(150, 'meters') → '137 m'
 */
export function formatYards(
  yards: number,
  pref: DistancePreference,
): string {
  return `${yardsToDisplay(yards, pref)} ${yardsLabel(pref)}`;
}

/**
 * Returns a fully-formatted distance string for a canonical feet value.
 * Examples:
 *   formatFeet(10, 'yards')  → '10 ft'
 *   formatFeet(10, 'meters') → '3 m'
 */
export function formatFeet(
  feet: number,
  pref: DistancePreference,
): string {
  return `${feetToDisplay(feet, pref)} ${feetLabel(pref)}`;
}

// ---------------------------------------------------------------------------
// Input context helpers
// ---------------------------------------------------------------------------

/**
 * Returns the placeholder text for a shot-distance input in the current unit.
 *   yards  → 'e.g. 150 yds'
 *   meters → 'e.g. 137 m'
 */
export function distancePlaceholder(pref: DistancePreference, exampleYards = 150): string {
  const display = yardsToDisplay(exampleYards, pref);
  return `e.g. ${display} ${yardsLabel(pref)}`;
}

/**
 * Returns the placeholder for a putt-distance input.
 *   yards  → 'e.g. 10 ft'
 *   meters → 'e.g. 3 m'
 */
export function puttPlaceholder(pref: DistancePreference, exampleFeet = 10): string {
  const display = feetToDisplay(exampleFeet, pref);
  return `e.g. ${display} ${feetLabel(pref)}`;
}

// ---------------------------------------------------------------------------
// Distance band labels (for range rows in stats tables)
// ---------------------------------------------------------------------------

/**
 * Given a range expressed in yards (e.g. [50, 75]), returns the display-unit
 * range label. Fractional metres are floored to keep labels tidy.
 *
 * Examples:
 *   yardsRangeLabel([50, 75], 'yards')  → '50-75 yds'
 *   yardsRangeLabel([50, 75], 'meters') → '46-69 m'
 *   yardsRangeLabel([225, null], 'yards')  → '225+ yds'
 *   yardsRangeLabel([225, null], 'meters') → '206+ m'
 */
export function yardsRangeLabel(
  [low, high]: [number, number | null],
  pref: DistancePreference,
): string {
  const lo = yardsToDisplay(low, pref);
  if (high === null) return `${lo}+ ${yardsLabel(pref)}`;
  const hi = yardsToDisplay(high, pref);
  return `${lo}-${hi} ${yardsLabel(pref)}`;
}

/**
 * Like yardsRangeLabel but for ranges expressed in feet (putting stats).
 */
export function feetRangeLabel(
  [low, high]: [number, number | null],
  pref: DistancePreference,
): string {
  const lo = feetToDisplay(low, pref);
  if (high === null) return `${lo}+ ${feetLabel(pref)}`;
  const hi = feetToDisplay(high, pref);
  return `${lo}-${hi} ${feetLabel(pref)}`;
}
