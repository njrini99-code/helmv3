/**
 * Error budget — a rolling-window burn rate over the reliability collector's
 * own record, per Bridge Control Plane Phase D.4.2
 * (docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md §2 item 2).
 *
 * WHAT THIS IS NOT: an errors-over-requests SLO. The collector's rows
 * (`background_job_logs` under `RELIABILITY_SNAPSHOT_JOB_TYPE`) carry
 * grouped ERROR/warning fingerprint counts, never a request or session
 * denominator — there is no traffic figure anywhere in `ReliabilityRun`. A
 * ratio computed here is "observed fingerprint occurrences over the tier's
 * allowed occurrences across N collector windows", never "success rate", and
 * the exported types are named to say so.
 *
 * WHAT THIS REUSES, NOT REINVENTS: the budget per window comes from
 * `TIER_THRESHOLDS` (`feature-registry.ts:168-171`) — the same numbers that
 * already gate `computeFeatureStatus()`'s single-window amber/red call. This
 * module's only new idea is accumulating that allowance across a trailing
 * window count instead of judging one snapshot in isolation.
 *
 * HONESTY RULES (the ones two prior Bridge PRs were sent back for breaking):
 *   - A window is either fully READABLE (its `background_job_logs` row
 *     parsed AND its collector run was not `blind`) or it is not counted at
 *     all. A blind run means at least one arm could not reach its provider —
 *     we do not know what it would have found for any feature, so treating
 *     its absence of signals as "zero errors" would be the exact false-green
 *     this system exists to prevent.
 *   - `partial`/`degraded` windows DO count (real, if incomplete, data was
 *     collected) but mark every feature they touch `observedIsFloor: true` —
 *     the count is a provable minimum, never asserted as exact.
 *   - A feature with **zero readable windows** in the considered range is
 *     `'unknown'`, never `'ok'`. Zero readable windows means the budget was
 *     never actually measured, not that nothing went wrong.
 */

import {
  FEATURE_REGISTRY,
  TIER_THRESHOLDS,
  type FeatureKey,
  type FeatureTier,
} from '@/lib/admin/feature-registry';
import type { CorrelatedSignal, SourceStatus } from './types';

/** One collector snapshot, reduced to what this module needs. Callers derive
 *  this from `ReliabilityRunRow` (`src/lib/admin/data/reliability.ts`):
 *  `readable = row.run !== null`, and the rest come straight off `row.run`. */
export interface ErrorBudgetWindowInput {
  startedAt: string | null;
  /** false when the row's metadata failed to parse (`ReliabilityRunRow.run === null`) —
   *  distinct from a parsed run whose collector itself went blind. */
  readable: boolean;
  overallStatus: SourceStatus | null;
  signals: readonly CorrelatedSignal[];
  truncatedSignals: number;
}

export type ErrorBudgetState = 'ok' | 'amber' | 'red' | 'unknown';

export interface FeatureErrorBudget {
  featureId: FeatureKey;
  tier: FeatureTier;
  windowsConsidered: number;
  windowsReadable: number;
  /** Observed fingerprint occurrences, summed across readable windows only. */
  observedCount: number;
  /** True when `observedCount` is a provable floor, not an exact count —
   *  set by any contributing `degraded`/`partial` window, any truncated
   *  window, or any folded signal whose `countBasis` is `'unknown'`. */
  observedIsFloor: boolean;
  /** `tier.redFp * windowsReadable` — the cumulative allowance across every
   *  window actually measured. Null only when `windowsReadable === 0`. */
  allowedCount: number | null;
  /** `observedCount / allowedCount`. Null exactly when `allowedCount` is
   *  null — never coerced to 0, which would read as "no burn" rather than
   *  "never measured". */
  burnRate: number | null;
  state: ErrorBudgetState;
}

export interface ErrorBudgetReport {
  generatedAt: string;
  windowsConsidered: number;
  windowsReadable: number;
  /** True when NOT ONE considered window was readable — the report has
   *  nothing to say about any feature, and every row below is `'unknown'`. */
  fullyBlind: boolean;
  /** Worst-first: red, then amber, then unknown, then ok — an operator
   *  scanning top-down sees what needs attention before what doesn't. */
  features: readonly FeatureErrorBudget[];
}

const STATE_RANK: Readonly<Record<ErrorBudgetState, number>> = { red: 0, amber: 1, unknown: 2, ok: 3 };

function budgetStateFor(burnRate: number, tier: FeatureTier): ErrorBudgetState {
  const { amberFp, redFp } = TIER_THRESHOLDS[tier];
  if (burnRate >= 1) return 'red';
  // amberFp/redFp is the same ratio computeFeatureStatus() applies per
  // window; here it applies to the cumulative rate instead of a single
  // window's raw count.
  if (redFp > 0 && burnRate >= amberFp / redFp) return 'amber';
  return 'ok';
}

/**
 * Pure. `windows` should be newest-first or oldest-first — order does not
 * matter, every window is folded independently. Callers bound how many
 * windows are considered (e.g. the Reliability tab's `HISTORY_LIMIT`); this
 * function never fetches more itself.
 */
export function computeErrorBudgets(windows: readonly ErrorBudgetWindowInput[], now: Date = new Date()): ErrorBudgetReport {
  const trackedFeatures = FEATURE_REGISTRY.filter((f) => f.excluded !== 'crm');

  const readableWindows = windows.filter((w) => w.readable && w.overallStatus !== 'blind' && w.overallStatus !== null);

  const perFeature = new Map<FeatureKey, { observedCount: number; observedIsFloor: boolean }>();
  for (const f of trackedFeatures) perFeature.set(f.key, { observedCount: 0, observedIsFloor: false });

  for (const win of readableWindows) {
    const windowIsFloor = win.overallStatus !== 'ok' || win.truncatedSignals > 0;
    for (const signal of win.signals) {
      const featureId = signal.featureId as FeatureKey | null;
      if (!featureId || !perFeature.has(featureId)) continue; // unmapped route or excluded feature — not this report's concern
      const acc = perFeature.get(featureId)!;
      acc.observedCount += signal.count;
      if (windowIsFloor || signal.countIsFloor) acc.observedIsFloor = true;
    }
  }

  const features: FeatureErrorBudget[] = trackedFeatures.map((def) => {
    const acc = perFeature.get(def.key)!;
    const windowsReadable = readableWindows.length;
    const allowedCount = windowsReadable > 0 ? TIER_THRESHOLDS[def.tier].redFp * windowsReadable : null;
    const burnRate = allowedCount !== null && allowedCount > 0 ? acc.observedCount / allowedCount : allowedCount === 0 ? 0 : null;
    const state: ErrorBudgetState = windowsReadable === 0 ? 'unknown' : budgetStateFor(burnRate ?? 0, def.tier);
    return {
      featureId: def.key,
      tier: def.tier,
      windowsConsidered: windows.length,
      windowsReadable,
      observedCount: acc.observedCount,
      observedIsFloor: acc.observedIsFloor,
      allowedCount,
      burnRate,
      state,
    };
  });

  features.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || b.burnRate! - a.burnRate! || a.featureId.localeCompare(b.featureId));

  return {
    generatedAt: now.toISOString(),
    windowsConsidered: windows.length,
    windowsReadable: readableWindows.length,
    fullyBlind: windows.length > 0 && readableWindows.length === 0,
    features,
  };
}
