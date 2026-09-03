import 'server-only';

/**
 * Silence detection — Bridge Control Plane Phase D.4/D.6.
 *
 * "Distinguish 'no events because healthy' from 'no events because the
 * emitter is dead'" (`HELM_AUTONOMY_CONTROL_PLANE.md` §16's Tool Chaos Lab
 * invariant). This module does NOT re-derive heartbeat staleness — it reuses
 * the discriminator `get_feature_health()` already computes per feature:
 * `FeatureHealth.drillIn.heartbeatAgeHours` (`fetchFeatureHealth()`,
 * `src/lib/admin/data/feature-health.ts`), which is already tier- and
 * override-aware (`FeatureHealthInputs.heartbeatStaleHoursOverride`, the
 * same input `qualifiers`' widened 7-day window feeds). The independent
 * threshold read here (`TIER_THRESHOLDS`/`heartbeatStaleHoursOverride` from
 * `feature-registry.ts`) exists only to CLASSIFY that already-computed age
 * against the feature's own allowance — not to recompute the age itself.
 *
 * Three states, per the plan's own framing:
 *   - `'unknown'`        the RPC that supplies heartbeatAgeHours could not
 *                        be reached this run — a blind read, not evidence
 *                        of anything.
 *   - `'no_heartbeat_signal'`  the feature has no heartbeat table, or the
 *                        table has zero rows ever — staleness genuinely
 *                        cannot be assessed (matches `FeatureHealthInputs`'
 *                        own doc on `heartbeatLastActivity`).
 *   - `'healthy_quiet'`  recent activity, OR the feature is declared
 *                        `seasonalEmpty` (an expected off-season silence),
 *                        OR its age sits inside its own allowed window.
 *   - `'stale'`          past its own allowed window and NOT seasonal — a
 *                        possibly-dead emitter, worth an operator's glance.
 */

import { FEATURE_REGISTRY, TIER_THRESHOLDS, type FeatureKey } from '@/lib/admin/feature-registry';
import type { FeatureHealth } from '@/lib/admin/data/feature-health';

export type SilenceState = 'healthy_quiet' | 'stale' | 'no_heartbeat_signal' | 'unknown';

export interface FeatureSilence {
  featureId: FeatureKey;
  label: string;
  state: SilenceState;
  heartbeatAgeHours: number | null;
  /** The effective threshold this feature was judged against — null exactly
   *  when `state` is `'no_heartbeat_signal'` or `'unknown'`, where no
   *  threshold was ever applied. */
  thresholdHours: number | null;
  reason: string;
}

export interface SilenceReport {
  generatedAt: string;
  /** True when the whole underlying read was blind — every feature below
   *  is `'unknown'`, never a fabricated `'healthy_quiet'`. */
  blind: boolean;
  features: readonly FeatureSilence[];
}

const DEF_BY_KEY = new Map(FEATURE_REGISTRY.filter((f) => f.excluded !== 'crm').map((f) => [f.key, f]));

function classify(fh: FeatureHealth): FeatureSilence {
  const def = DEF_BY_KEY.get(fh.key);
  const ageHours = fh.drillIn.heartbeatAgeHours;

  if (ageHours === null) {
    return {
      featureId: fh.key,
      label: fh.label,
      state: 'no_heartbeat_signal',
      heartbeatAgeHours: null,
      thresholdHours: null,
      reason: 'No heartbeat table configured, or it has zero rows — staleness cannot be assessed.',
    };
  }

  if (!def) {
    // Should not happen (FeatureHealth.key is drawn from the same registry),
    // but a lookup miss must still degrade honestly rather than throw.
    return {
      featureId: fh.key,
      label: fh.label,
      state: 'unknown',
      heartbeatAgeHours: ageHours,
      thresholdHours: null,
      reason: 'No matching feature-registry definition to judge staleness against.',
    };
  }

  const threshold = def.heartbeatStaleHoursOverride ?? TIER_THRESHOLDS[def.tier].heartbeatStaleHours;

  if (def.seasonalEmpty || ageHours <= threshold) {
    return {
      featureId: fh.key,
      label: fh.label,
      state: 'healthy_quiet',
      heartbeatAgeHours: ageHours,
      thresholdHours: threshold,
      reason: def.seasonalEmpty
        ? 'Declared seasonalEmpty — an off-season silence is expected, not a fault.'
        : `Last activity ${ageHours.toFixed(1)}h ago, within its ${threshold}h allowed window.`,
    };
  }

  return {
    featureId: fh.key,
    label: fh.label,
    state: 'stale',
    heartbeatAgeHours: ageHours,
    thresholdHours: threshold,
    reason: `Last activity ${ageHours.toFixed(1)}h ago, past its ${threshold}h allowed window — a possibly-dead emitter, not necessarily a real outage.`,
  };
}

/** Pure. `features` is `fetchFeatureHealth()`'s already-fetched result;
 *  `degraded` is that same call's own blind-read flag — passed in rather
 *  than re-derived, so this module never disagrees with the caller about
 *  whether the read succeeded. */
export function computeSilenceReport(features: readonly FeatureHealth[], degraded: boolean, now: Date = new Date()): SilenceReport {
  if (degraded) {
    return {
      generatedAt: now.toISOString(),
      blind: true,
      features: FEATURE_REGISTRY.filter((f) => f.excluded !== 'crm').map((def) => ({
        featureId: def.key,
        label: def.label,
        state: 'unknown',
        heartbeatAgeHours: null,
        thresholdHours: null,
        reason: 'get_feature_health() did not respond this run — every heartbeat reading is unknown, not healthy.',
      })),
    };
  }

  return {
    generatedAt: now.toISOString(),
    blind: false,
    features: features.map(classify),
  };
}
