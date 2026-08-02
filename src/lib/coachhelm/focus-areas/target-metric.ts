/**
 * ============================================================================
 * Focus-area `target_metric` resolution — the single place that decides whether
 * an area can be auto-tracked, and what its canonical id is.  Issue #1239.
 * ----------------------------------------------------------------------------
 * `golf_player_focus_areas.target_metric` is free text, and the progress driver
 * recognizes exactly two vocabularies:
 *
 *   1. the focus-area catalog (`findMetric` — stable key OR legacy display
 *      label), which drives the windowed per-round path, and
 *   2. the v3 canonical metric registry (`isMetricId`), which drives the
 *      `golf_player_standing` fallback.
 *
 * Anything in neither is skipped forever. That is correct behaviour — the
 * driver must never fabricate a value — but on live data 8 of the 10 targeted
 * active areas landed there, so the feature looked broken rather than honest.
 *
 * Free-text metrics remain SUPPORTED: the create modal deliberately offers a
 * "Custom metric…" escape hatch, and a coach tracking something we cannot
 * compute is a legitimate use. The defect was that an untrackable area was
 * visually indistinguishable from a tracking one. So this module does not
 * reject custom text — it lets callers ASK, via {@link isTrackableFocusMetric},
 * so the UI can say "log this one yourself" instead of implying a live feed.
 * ========================================================================== */

import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { findMetric } from './catalog';

/**
 * Legacy `target_metric` strings that predate the two canonical vocabularies,
 * mapped onto the id that means the same thing.
 *
 * Each mapping is pinned by the owning area's own TITLE, which names the band
 * explicitly — these are not guesses at what the string might have meant:
 *
 *   make_pct_5_10          "Rebuild 5–10 ft make rate"           → exact band match
 *   Avg proximity 80-120y  "Wedge Distance Control (80-120 yards)" → 80-120 yd sits
 *                          wholly inside the canonical 50-125 yd band
 *   avg_proximity_ft       "Tighten 150–180y approach dispersion"  → APPROXIMATE:
 *                          150-180 yd straddles the 125-175 and 175+ bands; 125-175
 *                          is the closest canonical home and covers most of it
 *
 * Note the canonical proximity ids carry an `ft` suffix for their UNIT (the
 * value is in feet) while the band in their display label is in YARDS —
 * `approach_proximity_50_125ft` renders as "Approach Proximity 50-125 yd".
 *
 * Deliberately NOT mapped: `three_putt_chain` ("Lag putts → 3-putt cascade").
 * It is a narrative cascade insight with no scalar equivalent, and its areas
 * carry null current/target — they already render the honest "No target set
 * yet" state. Inventing a scalar for it would be worse than leaving it.
 *
 * Keys are lowercased; lookups normalize.
 */
export const LEGACY_TARGET_METRIC_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  make_pct_5_10: 'putts_made_5_10ft_pct',
  'avg proximity 80-120y': 'approach_proximity_50_125ft',
  avg_proximity_ft: 'approach_proximity_125_175ft',
});

/**
 * Canonicalize a stored/entered `target_metric`.
 *
 * Returns the stable id the progress driver will recognize — a catalog key or a
 * v3 registry metric id — or `null` for genuinely custom/unrecognized text.
 * `null` is not an error: it means "this area is manual-tracking only".
 */
export function resolveFocusTargetMetric(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;

  // Catalog first, resolving a legacy display label onto its stable key so the
  // stored value stops depending on label copy ("Fairways Hit %" → fairways_hit_pct).
  const catalogEntry = findMetric(t);
  if (catalogEntry) return catalogEntry.key;

  if (isMetricId(t)) return t;

  return LEGACY_TARGET_METRIC_ALIASES[t.toLowerCase()] ?? null;
}

/**
 * Whether the progress driver can move this area's `current_value` on its own.
 * Drives the "Manual" affordance on the card — an area that cannot auto-track
 * must say so rather than showing a bar that will never move.
 */
export function isTrackableFocusMetric(raw: string | null | undefined): boolean {
  return resolveFocusTargetMetric(raw) !== null;
}
