/**
 * Reliability collector — normalized shapes.
 *
 * The collector reads Vercel, Sentry and Supabase every 3 hours, folds what it
 * finds into one deduped signal set, and writes a single `background_job_logs`
 * row so the Helm Bridge can render it live. This file holds the shapes only;
 * `normalize.ts` holds the pure folding logic and `sources/*` the I/O.
 *
 * WHY A SOURCE CARRIES ITS OWN STATUS
 * -----------------------------------
 * Each arm returns `SourceResult`, not a bare array. An arm that cannot reach
 * its provider — no token, HTTP 500, timeout — reports `status: 'blind'` with a
 * reason, and the run's overall status degrades to match. A collector that
 * returned `[]` for an unreachable Sentry would render as "0 problems found"
 * on a dashboard whose entire purpose is telling you whether anything is wrong.
 *
 * That is not hypothetical here. As of 2026-08-26 the repo's GitHub Actions
 * secrets hold Supabase credentials but NOT `SENTRY_READ_TOKEN` or a Vercel
 * token; those live in Vercel's production env, a different store. So two of
 * three arms start blind, and the system has to say so rather than look clean.
 * It is the same failure the quality-gates rule records for `check:types-drift`
 * — a job that stays green while checking nothing — and the OS contract's
 * "never error→[]" line names it directly.
 */

/** Reuses the Bridge's incident vocabulary so severities compare across sources. */
export type ReliabilitySeverity = 'critical' | 'error' | 'warning' | 'info';

export type ReliabilitySource = 'vercel' | 'sentry' | 'supabase';

/**
 * Risk tier per `memory/system/golfhelm-engineering-os.md`. The collector only
 * ever *proposes* a tier; nothing in this phase acts on one. R3 exists in the
 * type so a privileged signal can be labelled as such and visibly withheld from
 * any future auto-dispatch, rather than being absent and therefore silently
 * eligible.
 */
export type RiskTier = 'R0' | 'R1' | 'R2' | 'R3';

/**
 * Why an arm produced what it produced.
 *
 * - `ok`      — reached the provider, results are complete for the window.
 * - `partial` — reached it, but truncated (see `droppedCount`). Still useful.
 * - `blind`   — could not read it at all. Signals from this arm are ABSENT,
 *               not zero. Never render a blind arm as healthy.
 */
export type SourceStatus = 'ok' | 'partial' | 'blind';

export interface SourceResult {
  source: ReliabilitySource;
  status: SourceStatus;
  /** Operator-facing explanation. Required when status !== 'ok'. */
  reason: string | null;
  signals: RawSignal[];
  /**
   * How many items this arm deliberately did not return (top-N cap, window
   * bound, page limit). Surfaced in the Bridge because quality-gates §1
   * requires bounded coverage to say what it dropped — silent truncation reads
   * as "covered everything".
   */
  droppedCount: number;
  /** Milliseconds spent in this arm, for spotting the one that is timing out. */
  durationMs: number;
}

/** One occurrence-group as a single source sees it, before cross-source folding. */
export interface RawSignal {
  source: ReliabilitySource;
  severity: ReliabilitySeverity;
  /** Short operator-facing label. Redacted before storage. */
  title: string;
  /** Longer detail. Redacted before storage. */
  message: string;
  route: string | null;
  errorCode: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
  /**
   * Provider-side identity (Sentry issue id, admin_events fingerprint, Vercel
   * request id). Kept as an evidence REFERENCE so an operator can pivot to the
   * source of truth — spec §23's "source IDs as evidence references", and the
   * reason raw logs never need to be copied into this row.
   */
  evidenceRef: string | null;
}

/**
 * A raw signal folded across sources by shared signature.
 *
 * `signature` comes from `buildIncidentSignature` — the SAME function whose
 * output is already stored write-time in `admin_events.fingerprint`. Reusing it
 * rather than inventing a second scheme is what lets a Sentry issue and a
 * Supabase error row for one root cause collapse into one entry here, and it
 * keeps this view consistent with the Errors tab and the Golf Tracer, which the
 * admin-platform feature doc requires be a single grouping algorithm.
 */
export interface CorrelatedSignal {
  signature: string;
  severity: ReliabilitySeverity;
  title: string;
  summary: string;
  route: string | null;
  errorCode: string | null;
  /** Total occurrences across every source that saw it. */
  count: number;
  firstSeen: string;
  lastSeen: string;
  /** Which arms saw this — the cross-source corroboration an operator wants. */
  sources: ReliabilitySource[];
  /** Feature id from `memory/registry.yml`, or null when the route maps to none. */
  featureId: string | null;
  /** Proposed tier. Advisory in this phase; nothing dispatches on it yet. */
  proposedRisk: RiskTier;
  evidenceRefs: string[];
}

/** The whole run, as written to `background_job_logs.metadata`. */
export interface ReliabilityRun {
  /** Schema version, so a Bridge reading an older row can degrade honestly. */
  version: 1;
  windowStart: string;
  windowEnd: string;
  /** Worst arm wins: any blind arm makes the run degraded. */
  overallStatus: SourceStatus;
  sources: Array<Omit<SourceResult, 'signals'>>;
  signals: CorrelatedSignal[];
  /** Signals discarded by the top-N cap after correlation. */
  truncatedSignals: number;
}
