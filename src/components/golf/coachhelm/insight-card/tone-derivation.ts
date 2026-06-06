/**
 * tone-derivation — pure functions that map an `EvidenceInsight` row to its
 * visual tone.
 *
 * Lives outside `InsightCard.tsx` so downstream teams (Hub / CoachHelm
 * Dashboard / Round Review) can classify insights without pulling the React
 * primitive. No React, no DB, no side effects — trivially testable.
 *
 * Rules are Rule 4 + Rule 7 of the Insight Delivery design contract:
 *   docs/superpowers/plans/2026-04-22-insight-delivery/00-design-contract.md
 */
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';

export type DerivedTone =
  | 'urgent'
  | 'cautionary'
  | 'encouraging'
  | 'neutral'
  | 'celebratory';

/**
 * Maps an insight row to one of five tones. Ordering matters — the first
 * matching branch wins.
 *
 *  1. `resolved` lifecycle always wins → celebratory
 *  2. `urgent` priority → urgent
 *  3. `pressure` category with a heavy stroke impact → urgent
 *  4. `high` priority, or `strokes_impact * confidence > 1.0` → cautionary
 *  5. Positive metric and the player is ahead of comparison → encouraging
 *  6. Otherwise → neutral
 */
export function deriveTone(insight: EvidenceInsight): DerivedTone {
  if (insight.lifecycle_state === 'resolved') return 'celebratory';

  const priority = insight.priority;
  if (priority === 'urgent') return 'urgent';

  const evidence = insight.evidence;
  const strokesImpact = Number(evidence?.strokes_impact ?? 0);
  const confidence = Number(evidence?.confidence ?? 0);
  const metric = evidence?.metric ?? '';

  // Rule 7: pressure + strokes_impact > 2 is always urgent — pressure
  // failures compound across tournament holes, so we give them the same
  // weight as an explicitly-tagged urgent row.
  if (insight.category === 'pressure' && Math.abs(strokesImpact) > 2) {
    return 'urgent';
  }

  if (priority === 'high') return 'cautionary';
  if (Math.abs(strokesImpact) * confidence > 1.0) return 'cautionary';

  // Encouraging: positive-polarity metric where the player beats the comp.
  // The movement `direction` is irrelevant here — we're looking at a level
  // check (your_value vs comparison_value) not a delta.
  if (evidence) {
    const yourAhead = Number(evidence.your_value ?? 0) > Number(evidence.comparison_value ?? 0);
    if (yourAhead && isPositivePolarityMetric(metric)) return 'encouraging';
  }

  return 'neutral';
}

/**
 * Given an engine-emitted movement direction and the metric name, returns
 * true if the movement is actually an improvement. "Up" on make_pct is good;
 * "up" on severity is bad. The severity family lives on the negative-polarity
 * side.
 */
export function isImprovement(direction: 'up' | 'down', metric: string): boolean {
  if (isNegativePolarityMetric(metric)) return direction === 'down';
  return direction === 'up';
}

// Fallback only — used for composite ad-hoc metric strings that aren't in the
// canonical v3 registry (closing_hole_delta, compound_mistake_rate,
// short_side_proximity, flyer_lie_proximity, approach_direction_*, …). All such
// composite metrics are lower-better, so the patterns below are deliberately
// broad on delta/proximity/rate/direction/leak/bias families. Canonical metrics
// are resolved authoritatively from the registry first (see below), so this
// never overrides a real direction.
//
// ui-tone-2: `direction|leak|bias` were added so an UN-registered, worsening
// dispersion metric (e.g. `approach_direction_left_pct`) is classified
// lower-better and does NOT paint a GREEN ↑ on a getting-worse leak.
const NEGATIVE_METRIC_PATTERN =
  /severity|score_to_par|scoring_par|miss|stddev|dispersion|penalty|delta|proximity|compound|big_number|fatigue|direction|leak|bias/i;

/** "Less is better". Authoritative source is the metric registry's `direction`
 *  (keeps tone in sync with the 28-metric StandingBar config); the regex is a
 *  fallback for non-registry composite metric strings. */
function isNegativePolarityMetric(metric: string): boolean {
  const cfg = getMetricRenderConfig(metric);
  if (cfg) return cfg.direction === 'lower_better';
  return NEGATIVE_METRIC_PATTERN.test(metric);
}

/** "More is better" — everything that isn't explicitly negative polarity. */
function isPositivePolarityMetric(metric: string): boolean {
  return !isNegativePolarityMetric(metric);
}
