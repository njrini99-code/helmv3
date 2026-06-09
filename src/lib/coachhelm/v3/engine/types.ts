/**
 * v3 engine — shared types.
 *
 * Light typing surface for the BaseGenerator + concrete generator
 * implementations. Each concrete generator picks its own aggregate
 * shape (subtype of GeneratorAggregate) and content composition rules.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { InsightCategory, InsightEvidence, InsightPriority } from '@/lib/coachhelm/v2/insights/types';

/**
 * Per-generator aggregate output. Subclasses extend with their own
 * metric-specific fields (e.g. bucket label, mean, stddev). The base
 * class only cares about `sampleN` (for the min-sample gate) and
 * `playerValue` (for standing + counterfactual).
 */
export interface GeneratorAggregate {
  /** Number of underlying observations contributing to the aggregate. */
  sampleN: number;
  /**
   * The player's measured value for the metric (matches the unit of the
   * v3 metric). Standing comparison + counterfactual both read this.
   */
  playerValue: number;
}

/**
 * Return value of `BaseGenerator.run()`. `id` is the upserted row id
 * when an insight was written, null when gated/suppressed.
 *
 * Mirrors the v2 upsertInsight contract — `gated=true` distinguishes
 * "philosophy gate suppressed me" from "I had no data and didn't try."
 */
export interface RunResult {
  id: string | null;
  gated: boolean;
  /**
   * Number of stale rows in this generator's signature scope archived
   * because the generator no longer emits them (to-95 audit P2 stale-row
   * sweep). Absent when the generator declares no scope or the run exited
   * on a path that must not retract (gated / no-standing / error).
   */
  retracted?: number;
}

/**
 * Content composition output. The base class assembles this with
 * standing + counterfactual before calling upsertInsight.
 */
export interface ComposedContent {
  title: string;
  content: string;
  evidence: InsightEvidence;
  /** Generator-specific signature stable part. Base class prefixes "v3:". */
  signature: string;
  /** Optional severity, threaded by BaseGenerator into the upsert. Absent →
   *  the DB default 'medium' stands. A generator sets it from its verdict. */
  priority?: InsightPriority;
}

/** Convenience re-exports for generator authors. */
export type { MetricId, InsightCategory, InsightEvidence, InsightPriority };
