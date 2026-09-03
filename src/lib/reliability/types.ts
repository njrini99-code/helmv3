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
 * That is not hypothetical here. This collector runs as a VERCEL CRON, so the
 * credentials that matter are the ones in Vercel's production env — not the
 * repo's GitHub Actions secrets, which is where an earlier draft of this comment
 * looked because the collector was originally going to run in Actions. Checked
 * 2026-08-26: `SENTRY_READ_TOKEN` IS present in production env, so the Sentry
 * arm should read; `VERCEL_API_TOKEN` is unverified, so the Vercel arm is the
 * one likely to start blind.
 *
 * The correction matters more than the detail. A confidently-wrong justification
 * is worse than none — it survives review because it reads as researched, and
 * the next person reasons from a store this code never consults.
 *
 * It is the same failure the quality-gates rule records for `check:types-drift`
 * — a job that stays green while checking nothing — and the OS contract's
 * "never error→[]" line names it directly.
 */

import type { InvariantRunSummary } from './invariants/run-checks';

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
 * - `ok`       — reached the provider, results are complete for the window.
 * - `partial`  — reached it, but truncated (see `bounded`). Still useful.
 * - `degraded` — a rate limit (429) survived one honoured Retry-After retry.
 *                Signals from this arm are ABSENT for this run, same as
 *                `blind`, but the cause is transient and usually self-clears
 *                — worth telling apart from a token that is dead or missing.
 * - `blind`    — could not read it at all. Signals from this arm are ABSENT,
 *                not zero. Never render a blind arm as healthy.
 */
export type SourceStatus = 'ok' | 'partial' | 'degraded' | 'blind';

export interface SourceResult {
  source: ReliabilitySource;
  status: SourceStatus;
  /** Operator-facing explanation. Required when status !== 'ok'. */
  reason: string | null;
  signals: RawSignal[];
  /**
   * Whether this arm stopped short of the true total (top-N cap, window bound,
   * page limit) — NOT how many it dropped.
   *
   * The honest shape is a flag, because none of the three sources tells us the
   * count we did not fetch: a bounded PostgREST read that comes back full and
   * one that happens to end exactly at the limit are indistinguishable, and
   * Sentry's pager reports only that another page exists. An earlier version of
   * this field was named `droppedCount` and assigned `truncated ? 1 : 0` — a
   * boolean wearing a count's name, which would have rendered "1 dropped" for a
   * page that omitted thousands. Surfaced in the Bridge either way, because
   * quality-gates §1 requires bounded coverage to say so rather than read as
   * "covered everything".
   */
  bounded: boolean;
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
  /**
   * How `count` was arrived at.
   *
   * `'window'` — the number is occurrences inside the collection window.
   * `'unknown'` — the signal demonstrably occurred in the window, but the
   *   exact number could not be established. `count` is then a provable FLOOR
   *   (at least one), never a lifetime total and never zero.
   *
   * This exists because `is:unresolved` is a LIFETIME query and
   * `SentryIssue.count` is a LIFETIME number. A four-hour snapshot that
   * printed it was labelling months of occurrences as four hours of them.
   * Every arm declares its basis so a number can always be read.
   */
  countBasis: 'window' | 'unknown';
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
 * `signature` comes from `correlationSignature`, which calls the SAME
 * `buildIncidentSignature` the Errors tab and Golf Tracer group by — but with a
 * fixed severity, so the key reduces to `errorCode::route::messagePrefix`.
 *
 * That difference is deliberate and load-bearing. `buildIncidentSignature`
 * folds severity into its key, which is correct when grouping rows from one
 * writer and wrong across sources: Sentry rates as `error` plenty of conditions
 * this app logs as `warning`, so the severity-bearing key would split one root
 * cause into two entries and the cross-source badge would never appear.
 *
 * So what is shared with those other views is the normalisation and therefore
 * the notion of what counts as "the same failure" — NOT the literal hash. This
 * value is not equal to the row's stored `admin_events.fingerprint`, and no doc
 * should claim it is.
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
  /**
   * True when `count` is a provable FLOOR rather than an exact total — set
   * whenever any contributing `RawSignal` carried `countBasis: 'unknown'`
   * (see that field's doc on `RawSignal`). Sticky across a merge: one
   * source's floor is not erased by another source's exact count.
   */
  countIsFloor: boolean;
  firstSeen: string;
  lastSeen: string;
  /** Which arms saw this — the cross-source corroboration an operator wants. */
  sources: ReliabilitySource[];
  /** Feature id from `memory/registry.yml`, or null when the route maps to none. */
  featureId: string | null;
  /** Proposed tier. Advisory in this phase; nothing dispatches on it yet. */
  proposedRisk: RiskTier;
  /**
   * Evidence references PAIRED with the source that produced them.
   *
   * This was two parallel arrays — `sources[]` and `evidenceRefs[]` — and the
   * view paired them by index. They cannot be paired by index: `sources` dedupes
   * by source while refs dedupe by ref, so the moment one source contributes two
   * refs (two Sentry issues folding to one signature — the common case) or none,
   * the indices stop corresponding. The failure was silent and specific: a
   * Supabase fingerprint sitting at index 2 got attributed to `sentry`, so
   * `evidenceTarget`'s source check failed and it rendered as dead text instead
   * of a drill-through to `/admin/errors/<fingerprint>`.
   *
   * A ref means nothing without knowing which system it addresses, so the pair
   * is the unit.
   */
  evidence: EvidenceRef[];
}

export interface EvidenceRef {
  source: ReliabilitySource;
  ref: string;
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
  /**
   * Bridge Control Plane Phase D.4.3 — executable data invariants, run as a
   * fourth, independently fault-isolated arm alongside sentry/supabase/vercel
   * (see `collect.ts`). OPTIONAL and deliberately does not bump `version`: a
   * row written before this shipped has no `invariants` key, and
   * `src/lib/admin/data/reliability.ts`'s `parseRun` must keep reading it as
   * a valid `version: 1` run rather than rejecting it outright. Absent means
   * "not run yet" and must never be read as "no violations".
   */
  invariants?: InvariantRunSummary;
}
