/**
 * v3 engine — shared types.
 *
 * Light typing surface for the BaseGenerator + concrete generator
 * implementations. Each concrete generator picks its own aggregate
 * shape (subtype of GeneratorAggregate) and content composition rules.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { InsightCategory, InsightEvidence, InsightPriority } from '@/lib/coachhelm/v2/insights/types';
import type { ReadFloorShortfall } from './read-floors';

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
  /**
   * Slice 0b: the rounds that contributed observations to `sampleN`. When
   * set, the base stamps the read's window from exactly these rounds
   * (`engine/read-window.ts`); when absent it falls back to the composed
   * window range.
   */
  windowRoundIds?: readonly string[];
}

/**
 * Explicit, machine-readable receipt for a single generator run (P0-04).
 *
 * The legacy contract returned `{ id: null, gated: false }` for BOTH a clean
 * "no data in window" exit AND a swallowed internal throw, so a generator that
 * crashed was indistinguishable from one that legitimately had nothing to say.
 * `Promise.allSettled` in the orchestrator only sees a REJECTED promise — but
 * `run()` always RESOLVES (it catches its own error), so the throw was counted
 * as a success and the round was marked fully analyzed. This status closes that
 * gap: every exit path stamps exactly one receipt, and `'failed'` is the only
 * one that means "this generator threw and produced nothing".
 *
 * - `generated`   — an insight row was written (or refreshed).
 * - `gated`       — team toggle off, or the philosophy gate suppressed the write
 *                   (a product decision, NOT a failure).
 * - `no_data`     — aggregate was null or below the sample gate (legit dequalify).
 * - `standing_lag`— required standing row not yet computed (infra lag, retryable
 *                   but not a failure of THIS generator).
 * - `failed`      — `run()` caught a thrown error; the run produced nothing and
 *                   must be treated as a real failure by the orchestrator.
 */
export type RunStatus =
  | 'generated'
  | 'gated'
  | 'no_data'
  | 'standing_lag'
  | 'failed';

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
   * Machine-readable receipt (P0-04). The orchestrator inspects this to
   * distinguish a genuine failure (a swallowed throw) from a clean no-data /
   * gated / standing-lag exit. Back-compatible: `id`/`gated`/`retracted` keep
   * their prior meaning; `status` is additive.
   */
  status: RunStatus;
  /**
   * Number of stale rows in this generator's signature scope archived
   * because the generator no longer emits them (to-95 audit P2 stale-row
   * sweep). Absent when the generator declares no scope or the run exited
   * on a path that must not retract (gated / no-standing / error).
   */
  retracted?: number;
  /**
   * The raw caught error when `status === 'failed'` — absent on every other
   * status. `run()`'s own catch logs this with `describeError` already, but
   * that text-only log line is all the orchestrator's caller ever saw: the
   * receipt it actually inspects (`{ id, gated, status }`) carried no error
   * at all, so `analyzePlayer.tier1Generator`'s own admin_events row could
   * only say "generator threw internally" with no code or message attached.
   * Kept as `unknown` (not stringified here) so a consumer can put it in
   * `metadata: { dbError }` the way `pattern-miner.savePatterns` and the
   * other `dbError`-shaped call sites across `coachhelm/v2` already do,
   * rather than flattening it to text twice.
   */
  error?: unknown;
  /**
   * Slice 0b: set on a `no_data` exit when the read fell below its family
   * floor (`engine/read-floors.ts`) — the Watching count-down for the run log.
   */
  watching?: ReadFloorShortfall;
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
  /**
   * The generator's own verdict framing (PR #2073). With the root-cause flag
   * on, `strength` / `neutral` rows get no cause (there is no problem to
   * trace); `leak` rows do. Omitted → derived from `your_value` vs
   * `comparison_value` when the polarity is trustworthy
   * (`resolveInsightFraming` in `root-cause.ts`).
   */
  framing?: 'leak' | 'strength' | 'neutral';
  /**
   * The same title/content for a coach, in the third person (PR #2073;
   * written with `inBothVoices`, `engine/coach-voice.ts`). Stored as
   * `evidence.coach_copy` when it passes `coachCopyIssues` (same numbers, no
   * "you", no club). Omitted → coaches see `title`/`content`.
   */
  coach?: { title: string; content: string };
}

/** Convenience re-exports for generator authors. */
export type { MetricId, InsightCategory, InsightEvidence, InsightPriority };
