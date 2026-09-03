import 'server-only';

/**
 * SLO Center — Bridge Control Plane Phase D.6. One orchestration point that
 * fetches the three independent underlying sources (reliability collector
 * history, `get_feature_health()`, the flight-recorder trace RPC) in
 * parallel and hands each derived report's own pure computer
 * (`error-budget.ts`, `golden-path-health.ts`, `silence-detection.ts`,
 * `trace-funnels.ts`) its already-fetched input. No business logic lives
 * here — this file is I/O and shape-adaptation only, same division of labor
 * as every other `data/*.ts` module in the Bridge.
 *
 * PER-SOURCE FAILURE ISOLATION: the three sources are unrelated failure
 * domains (a cron-collector row, an RPC, a flight-recorder RPC) — one
 * failing must never blank the page section for either of the others.
 *
 * `cache()`-memoised per request, same pattern as `fetchFeatureHealth`/
 * `fetchFeatureHealthDetail`: the SLO page calls this once per section body
 * (error budget, golden-path health, silence, trace funnels), and without
 * memoisation that would be four independent fetches — including ten
 * `helm_debug_list_traces` RPC calls apiece — for one page load.
 */

import { cache } from 'react';
import { fetchReliabilitySnapshot } from '@/lib/admin/data/reliability';
import { fetchFeatureHealth } from '@/lib/admin/data/feature-health';
import { computeErrorBudgets, type ErrorBudgetReport, type ErrorBudgetWindowInput } from '@/lib/reliability/error-budget';
import { computeGoldenPathHealth, type GoldenPathHealthReport } from './golden-path-health';
import { computeSilenceReport, type SilenceReport } from './silence-detection';
import { fetchTraceFunnels, type TraceFunnelReport } from './trace-funnels';

export interface SloDashboard {
  generatedAt: string;

  /** Always present — `computeErrorBudgets([])` on a failed read, which
   *  renders every feature `'unknown'` rather than leaving the section
   *  blank. `errorBudgetError` names WHY when the underlying read failed. */
  errorBudget: ErrorBudgetReport;
  errorBudgetError: string | null;

  /** Derived from the SAME `errorBudget` above — never a second,
   *  independently-timed reliability read. */
  goldenPathHealth: GoldenPathHealthReport;

  silence: SilenceReport;
  silenceError: string | null;

  /** Null only when the trace-funnel fetch itself rejected outright (every
   *  per-workflow arm inside it is already fault-isolated — see
   *  `trace-funnels.ts`). */
  traceFunnels: TraceFunnelReport | null;
  traceFunnelsError: string | null;
}

export const fetchSloDashboard = cache(async (): Promise<SloDashboard> => {
  const now = new Date();
  const [reliability, featureHealth, funnels] = await Promise.allSettled([
    fetchReliabilitySnapshot(),
    fetchFeatureHealth(),
    fetchTraceFunnels(now),
  ]);

  let errorBudgetWindows: ErrorBudgetWindowInput[] = [];
  let errorBudgetError: string | null = null;

  if (reliability.status === 'fulfilled' && reliability.value.status === 'ok' && reliability.value.data) {
    errorBudgetWindows = reliability.value.data.history.map((row) => ({
      startedAt: row.startedAt,
      readable: row.run !== null,
      overallStatus: row.run?.overallStatus ?? null,
      signals: row.run?.signals ?? [],
      truncatedSignals: row.run?.truncatedSignals ?? 0,
    }));
  } else {
    errorBudgetError =
      reliability.status === 'fulfilled'
        ? (reliability.value.error ?? 'reliability snapshot unavailable')
        : reliability.reason instanceof Error
          ? reliability.reason.message
          : String(reliability.reason);
  }

  const errorBudget = computeErrorBudgets(errorBudgetWindows, now);
  const goldenPathHealth = computeGoldenPathHealth(errorBudget, now);

  let silence: SilenceReport;
  let silenceError: string | null = null;
  if (featureHealth.status === 'fulfilled') {
    silence = computeSilenceReport(featureHealth.value.features, featureHealth.value.degraded, now);
    if (featureHealth.value.degraded) silenceError = featureHealth.value.degradedReason;
  } else {
    silenceError = featureHealth.reason instanceof Error ? featureHealth.reason.message : String(featureHealth.reason);
    silence = computeSilenceReport([], true, now);
  }

  const traceFunnels = funnels.status === 'fulfilled' ? funnels.value : null;
  const traceFunnelsError =
    funnels.status === 'rejected' ? (funnels.reason instanceof Error ? funnels.reason.message : String(funnels.reason)) : null;

  return {
    generatedAt: now.toISOString(),
    errorBudget,
    errorBudgetError,
    goldenPathHealth,
    silence,
    silenceError,
    traceFunnels,
    traceFunnelsError,
  };
});
