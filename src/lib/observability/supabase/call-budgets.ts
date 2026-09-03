/**
 * Per-journey DB call budgets — brief §53.
 *
 * "Per-journey DB call budgets measured before enforced; detect N+1
 * amplification after releases."
 *
 * MEASURE BEFORE ENFORCE IS THE ENTIRE DESIGN, NOT A CAVEAT
 * ---------------------------------------------------------
 * There is no per-journey threshold table in this file, and shipping one
 * would be shipping a guess as truth. "Round tracking should make at most 7
 * DB calls" is a number nobody has measured, and once written down it reads
 * as authoritative forever — the exact rot `.claude/rules/shipping.md` §1
 * legislates against. What ships instead is:
 *
 *   1. a baseline COMPUTED from observed windows, which reports
 *      `baseline_status: 'collecting'` until it has enough of them, and
 *   2. a RELATIVE amplification test against that baseline, whose only
 *      constants are a global ratio and a global absolute floor, both
 *      overridable per call and neither attached to any journey.
 *
 * A journey with no baseline yet produces `amplified: false` and
 * `'collecting'` — never a violation, and never a fabricated pass either.
 * This mirrors `health-rules.ts`'s `RollbackRateResult` exactly, including
 * its `'collecting' | 'ready'` vocabulary, so the Bridge renders both the
 * same way.
 *
 * THE BASELINE IS A MEDIAN, NOT A MEAN. One pathological window (a backfill,
 * a retry storm) would drag a mean up and then hide the very amplification
 * this exists to catch.
 *
 * UNITS MUST MATCH OR THE COMPARISON IS REFUSED. Calls-per-execution is the
 * meaningful unit for N+1 — twice the traffic is twice the calls and is not
 * amplification. When execution counts are unavailable the module falls back
 * to calls-per-window and SAYS SO in `unit`; comparing a per-execution
 * baseline against a per-window reading returns `ratio: null` and
 * `amplified: false` rather than a number that means nothing.
 *
 * PURE. No I/O, no clock. Windows arrive as arguments.
 *
 * WHAT SUPPLIES THE INPUT — AND WHAT DOES NOT, YET
 * ------------------------------------------------
 * The Phase 1 statement sampler (`helm_debug.db_stat_deltas`) persists
 * `queryid`, `safe_query_class` and `source_class` per 15-minute window. It
 * has NO journey dimension, so nothing in this repo can attribute a call to
 * a journey today. This module is therefore the evaluator only; the collector
 * that would feed it is not built here and is recorded as a gap in
 * `docs/observability/SUPABASE_DIAGNOSTICS.md`. Building a fabricated
 * attribution to make the module look wired would be worse than an honest
 * `'collecting'`.
 */

export type CallBudgetBaselineStatus = 'collecting' | 'ready';

/** Below this many observed windows there is no meaningful baseline. Matches
 *  `query-regression.ts`'s `BASELINE_MIN_SAMPLES` rather than inventing a
 *  second number for the same idea. */
export const CALL_BUDGET_MIN_WINDOWS = 5;

/** A ratio at or above this is "materially more calls". Global, overridable,
 *  and attached to no journey. */
export const DEFAULT_AMPLIFICATION_RATIO = 2;

/** Below this many extra calls, a ratio is noise: 1 call becoming 3 is a 3x
 *  ratio and not an N+1. */
export const DEFAULT_MIN_ABSOLUTE_INCREASE = 5;

export type CallBudgetUnit = 'per-execution' | 'per-window';

export interface JourneyCallWindow {
  /** A low-cardinality journey label (brief §6's safe dimensions). Never a UUID. */
  journey: string;
  /** ISO timestamp of the window start. Ordering only; never parsed for a clock. */
  windowStartedAt: string;
  /** The release live during this window, when known. */
  releaseSha: string | null;
  /** DB calls attributed to this journey in this window. */
  dbCalls: number;
  /** How many journey executions those calls spread across. `null` when the
   *  source cannot say — which forces the per-window unit. */
  executions: number | null;
}

export interface JourneyCallBaseline {
  journey: string;
  baselineStatus: CallBudgetBaselineStatus;
  /** How many windows contributed. */
  windowCount: number;
  /** Median calls per unit. `null` while `'collecting'`. */
  baselineValue: number | null;
  unit: CallBudgetUnit;
  /** Distinct releases the baseline windows span, for the caller to render. */
  baselineReleaseShas: readonly string[];
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The unit is decided by the WHOLE window set, not per window: a set where
 * any window lacks an execution count falls back to per-window for all of
 * them, so the median is never a mixture of two units.
 */
function resolveUnit(windows: readonly JourneyCallWindow[]): CallBudgetUnit {
  const allHaveExecutions = windows.every((w) => w.executions !== null && w.executions > 0);
  return allHaveExecutions ? 'per-execution' : 'per-window';
}

function windowValue(window: JourneyCallWindow, unit: CallBudgetUnit): number | null {
  if (unit === 'per-window') return window.dbCalls;
  if (window.executions === null || window.executions <= 0) return null;
  return window.dbCalls / window.executions;
}

/**
 * Compute one journey's baseline from its observed windows.
 *
 * Fewer than `CALL_BUDGET_MIN_WINDOWS` windows yields `'collecting'` with a
 * `null` value — deliberately not "0 calls" and deliberately not the mean of
 * whatever few windows exist.
 */
export function computeJourneyCallBaseline(
  journey: string,
  windows: readonly JourneyCallWindow[],
  options?: { minWindows?: number },
): JourneyCallBaseline {
  const minWindows = options?.minWindows ?? CALL_BUDGET_MIN_WINDOWS;
  const mine = windows.filter((w) => w.journey === journey);
  const unit = resolveUnit(mine);
  const values = mine.map((w) => windowValue(w, unit)).filter((v): v is number => v !== null);
  const releaseShas = Array.from(new Set(mine.map((w) => w.releaseSha).filter((s): s is string => s !== null)));

  if (values.length < minWindows) {
    return {
      journey,
      baselineStatus: 'collecting',
      windowCount: values.length,
      baselineValue: null,
      unit,
      baselineReleaseShas: releaseShas,
    };
  }

  return {
    journey,
    baselineStatus: 'ready',
    windowCount: values.length,
    baselineValue: median(values),
    unit,
    baselineReleaseShas: releaseShas,
  };
}

/** Every journey present in the window set, each with its own baseline. */
export function computeAllJourneyCallBaselines(
  windows: readonly JourneyCallWindow[],
  options?: { minWindows?: number },
): readonly JourneyCallBaseline[] {
  const journeys = Array.from(new Set(windows.map((w) => w.journey))).sort();
  return journeys.map((j) => computeJourneyCallBaseline(j, windows, options));
}

// ---------------------------------------------------------------------------
// Amplification
// ---------------------------------------------------------------------------

export interface CallAmplificationOptions {
  /** Ratio at or above which the increase is material. Default 2. */
  amplificationRatio?: number;
  /** Absolute increase below which a ratio is noise. Default 5. */
  minAbsoluteIncrease?: number;
}

export interface CallAmplificationFinding {
  journey: string;
  baselineStatus: CallBudgetBaselineStatus;
  baselineValue: number | null;
  currentValue: number | null;
  unit: CallBudgetUnit;
  /** `null` when the comparison is refused (no baseline, or a unit mismatch). */
  ratio: number | null;
  amplified: boolean;
  /** The release live in the current window. */
  currentReleaseSha: string | null;
  /**
   * `true` when the current window's release differs from every release the
   * baseline spans, `false` when it matches one, `null` when either side does
   * not name a release. Reported, never REQUIRED for `amplified` — a call
   * explosion inside one release is still worth seeing, it just is not a
   * post-release regression.
   */
  afterRelease: boolean | null;
  reason: string;
}

/**
 * Compare one current window against a computed baseline.
 *
 * Refuses rather than guesses in three cases, all of which produce
 * `amplified: false` with a `null` ratio and a stated reason: the baseline is
 * still collecting; the units do not match; the current window has no usable
 * value.
 */
export function detectCallAmplification(input: {
  baseline: JourneyCallBaseline;
  current: JourneyCallWindow;
  options?: CallAmplificationOptions;
}): CallAmplificationFinding {
  const { baseline, current } = input;
  const ratioThreshold = input.options?.amplificationRatio ?? DEFAULT_AMPLIFICATION_RATIO;
  const absoluteThreshold = input.options?.minAbsoluteIncrease ?? DEFAULT_MIN_ABSOLUTE_INCREASE;

  const afterRelease =
    current.releaseSha === null || baseline.baselineReleaseShas.length === 0
      ? null
      : !baseline.baselineReleaseShas.includes(current.releaseSha);

  const base = {
    journey: baseline.journey,
    baselineStatus: baseline.baselineStatus,
    baselineValue: baseline.baselineValue,
    unit: baseline.unit,
    currentReleaseSha: current.releaseSha,
    afterRelease,
  };

  if (baseline.baselineStatus === 'collecting' || baseline.baselineValue === null) {
    return {
      ...base,
      currentValue: null,
      ratio: null,
      amplified: false,
      reason: `Baseline is still collecting (${baseline.windowCount} of ${CALL_BUDGET_MIN_WINDOWS} windows). No budget is enforced until it is measured.`,
    };
  }

  // The current window must be measurable in the SAME unit the baseline used.
  if (baseline.unit === 'per-execution' && (current.executions === null || current.executions <= 0)) {
    return {
      ...base,
      currentValue: null,
      ratio: null,
      amplified: false,
      reason: 'The baseline is per-execution but this window has no execution count — comparing it would produce a number that means nothing.',
    };
  }

  const currentValue = windowValue(current, baseline.unit);
  if (currentValue === null) {
    return { ...base, currentValue: null, ratio: null, amplified: false, reason: 'This window has no usable call count.' };
  }

  if (baseline.baselineValue <= 0) {
    return {
      ...base,
      currentValue,
      ratio: null,
      amplified: false,
      reason: 'The measured baseline is zero, so a ratio is undefined. Treat this journey as still unmeasured.',
    };
  }

  const ratio = currentValue / baseline.baselineValue;
  const absoluteIncrease = currentValue - baseline.baselineValue;
  const amplified = ratio >= ratioThreshold && absoluteIncrease >= absoluteThreshold;

  const rounded = Math.round(ratio * 100) / 100;
  const reason = amplified
    ? `${rounded}x the measured baseline (${baseline.unit}), an increase of ${Math.round(absoluteIncrease * 100) / 100}${afterRelease === true ? ', first seen under a release the baseline does not cover' : ''}.`
    : ratio >= ratioThreshold
      ? `${rounded}x the baseline, but only ${Math.round(absoluteIncrease * 100) / 100} more calls — below the absolute floor, so it is noise rather than amplification.`
      : `${rounded}x the measured baseline (${baseline.unit}) — within the expected range.`;

  return { ...base, currentValue, ratio, amplified, reason };
}
