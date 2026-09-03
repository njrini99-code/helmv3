/**
 * Alert policy, retry-storm detection, workload classification — brief
 * §49-55.
 *
 * Everything in this file is PURE: no fetch, no database, no Sentry call. The
 * reader (`src/lib/admin/database/alerts.ts`) composes Phase 1's readers
 * (overview, errors, performance) and this phase's platform reader into the
 * `AlertSignals` shape below and calls `evaluateAlertPolicy`; nothing here
 * decides what counts as "firing" for a given rule — that judgment belongs to
 * whoever built the signal (the reader, or a caller's test fixture), because
 * only the caller knows whether an input was blind.
 *
 * "UNKNOWN WHEN AN INPUT IS BLIND" IS STRUCTURAL, NOT A CONVENTION
 * ------------------------------------------------------------------
 * `evaluateAlertPolicy` always returns one row per rule in
 * `ALERT_POLICY_RULES` — a rule with no entry in `signals`, or an entry
 * explicitly marked `known: false`, becomes `state: 'unknown'`. There is no
 * code path that lets an absent signal read as "clear": the Bridge page this
 * feeds must never show a rule's silence as "not firing" when the real
 * answer is "nobody looked."
 *
 * SUPPRESSION GROUPS EVIDENCE, NEVER HIDES IT (brief §33, §49)
 * ----------------------------------------------------------------
 * "Group downstream evidence under one infrastructure incident without
 * hiding user impact." `suppressedBy` on a firing alert names OTHER rule ids
 * this one's evidence should be filed under for triage ordering — the
 * suppressed alert still reports `state: 'firing'` with its own evidence.
 * Nothing in this module removes a firing alert from the result list.
 */

// ---------------------------------------------------------------------------
// Declarative rule table — brief §49, verbatim severities
// ---------------------------------------------------------------------------

export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'TELEMETRY_DEFECT';

export interface AlertPolicyRule {
  id: string;
  severity: AlertSeverity;
  description: string;
}

export const ALERT_POLICY_RULES: readonly AlertPolicyRule[] = [
  // P0 — brief §49 first sentence
  { id: 'db_unavailable', severity: 'P0', description: 'Database unavailable' },
  { id: 'pool_exhaustion', severity: 'P0', description: 'Connection pool exhaustion' },
  { id: 'critical_journey_data_loss', severity: 'P0', description: 'Critical journey data-loss invariant violated' },
  { id: 'cross_tenant_rls_defect', severity: 'P0', description: 'Cross-tenant / RLS defect' },
  { id: 'systematic_round_persistence_failure', severity: 'P0', description: 'Systematic round persistence failure' },
  { id: 'schema_mismatch', severity: 'P0', description: 'Schema mismatch affecting a product path' },
  { id: 'mass_auth_5xx', severity: 'P0', description: 'Mass Auth 5xx' },
  // P1
  { id: 'sustained_critical_rpc_timeout_rate', severity: 'P1', description: 'Sustained critical RPC timeout rate' },
  { id: 'user_affecting_deadlock', severity: 'P1', description: 'User-affecting deadlock' },
  { id: 'realtime_critical_delivery_collapse', severity: 'P1', description: 'Realtime critical delivery collapse' },
  { id: 'repeated_storage_database_timeout', severity: 'P1', description: 'Repeated Storage DatabaseTimeout' },
  { id: 'missed_user_visible_cron', severity: 'P1', description: 'Missed user-visible cron' },
  { id: 'sustained_resource_saturation', severity: 'P1', description: 'Sustained resource saturation (CPU/memory/connections)' },
  // P2
  { id: 'performance_regression_no_failure', severity: 'P2', description: 'Performance regression without failure' },
  { id: 'elevated_retries', severity: 'P2', description: 'Elevated retries' },
  { id: 'bloat_vacuum', severity: 'P2', description: 'Bloat / vacuum concern' },
  { id: 'call_amplification', severity: 'P2', description: 'Call amplification (N+1-shaped)' },
  { id: 'noncritical_webhook_failures', severity: 'P2', description: 'Noncritical webhook failures' },
  // TELEMETRY_DEFECT — the observability system reporting on itself
  { id: 'sampler_stopped', severity: 'TELEMETRY_DEFECT', description: 'A collector stopped producing samples' },
  { id: 'metrics_api_unreadable', severity: 'TELEMETRY_DEFECT', description: 'Supabase Metrics API unreadable' },
  { id: 'sentry_blind', severity: 'TELEMETRY_DEFECT', description: 'Sentry read failed' },
  { id: 'flight_recorder_absent', severity: 'TELEMETRY_DEFECT', description: 'Flight Recorder absent for a required workflow' },
] as const;

export type AlertRuleId = (typeof ALERT_POLICY_RULES)[number]['id'];

// ---------------------------------------------------------------------------
// Signals in, evaluated alerts out
// ---------------------------------------------------------------------------

/** One rule's evidence, as the reader assembled it. `known: false` is the
 *  explicit "this input was blind" case — distinct from simply omitting the
 *  rule from `signals`, which the evaluator treats identically. Both spellings
 *  exist because a reader sometimes has a *reason* to give ("Sentry read
 *  failed: 503") and sometimes just doesn't have the data wired yet. */
export type AlertSignal =
  | { known: true; firing: boolean; evidence?: string; suppressedBy?: readonly AlertRuleId[] }
  | { known: false; reason: string };

export type AlertSignals = Partial<Record<AlertRuleId, AlertSignal>>;

export type AlertState = 'firing' | 'clear' | 'unknown';

export interface EvaluatedAlert {
  rule: AlertPolicyRule;
  state: AlertState;
  /** Non-null only when `state === 'unknown'`. */
  reason: string | null;
  /** Non-null only when `state === 'firing'`. Callers must have already
   *  sanitized any free text before it reaches this field — this module
   *  performs no redaction of its own. */
  evidence: string | null;
  /** Non-null only when `state === 'firing'` and the reader supplied it. */
  suppressedBy: readonly AlertRuleId[] | null;
}

export interface AlertPolicyResult {
  /** Always exactly `ALERT_POLICY_RULES.length` entries, in table order —
   *  P0s first, then P1, P2, TELEMETRY_DEFECT — which is already the rank
   *  order a triage view wants. */
  alerts: EvaluatedAlert[];
  /** Propagated from the caller — this module has no opinion on whether
   *  enough history exists to trust a baseline; it only carries the flag
   *  through so the Bridge can render "collecting" rather than a false
   *  "ready". */
  baselineStatus: 'collecting' | 'ready';
  firingCount: number;
  unknownCount: number;
}

export function evaluateAlertPolicy(
  signals: AlertSignals,
  options: { baselineStatus: 'collecting' | 'ready' },
): AlertPolicyResult {
  const alerts: EvaluatedAlert[] = ALERT_POLICY_RULES.map((rule) => {
    const signal = signals[rule.id];

    if (!signal) {
      return { rule, state: 'unknown', reason: 'no input supplied for this rule', evidence: null, suppressedBy: null };
    }
    if (!signal.known) {
      return { rule, state: 'unknown', reason: signal.reason, evidence: null, suppressedBy: null };
    }
    if (!signal.firing) {
      return { rule, state: 'clear', reason: null, evidence: null, suppressedBy: null };
    }
    return {
      rule,
      state: 'firing',
      reason: null,
      evidence: signal.evidence ?? null,
      suppressedBy: signal.suppressedBy ?? null,
    };
  });

  return {
    alerts,
    baselineStatus: options.baselineStatus,
    firingCount: alerts.filter((a) => a.state === 'firing').length,
    unknownCount: alerts.filter((a) => a.state === 'unknown').length,
  };
}

// ---------------------------------------------------------------------------
// Retry-storm detection — brief §54
// ---------------------------------------------------------------------------

/**
 * The four named storm shapes. `'other'` is not a storm kind — an event with
 * that mechanism is never evaluated, which is deliberate: this function only
 * ever reports on mechanisms it has a named threshold for, never a generic
 * "many occurrences" guess that could false-positive on an ordinarily chatty
 * fingerprint.
 */
export const RETRY_STORM_KINDS = [
  'postgrest_client_retry',
  'realtime_reconnect_loop',
  'auth_getuser_storm',
  'pg_net_unbounded_retry',
] as const;
export type RetryStormKind = (typeof RETRY_STORM_KINDS)[number];

/** Shape reused from `helm_debug.db_error_events` (`fingerprint`,
 *  `occurrence_count`) plus the two fields that store doesn't carry today
 *  (`attempt`, an explicit hour `timeBucket`) — kept as its own small input
 *  type rather than importing `DbErrorEventRow` from
 *  `src/lib/admin/database/errors.ts`, because this function is meant to run
 *  over ANY retry-shaped source (client-side PGRST003 counters, a Realtime
 *  reconnect counter that may never become a `db_error_events` row), not only
 *  that one store. */
export interface RetryStormEvent {
  fingerprint: string;
  mechanism: RetryStormKind | 'other';
  /** The single highest attempt number observed for this fingerprint in this
   *  bucket, when the caller tracks per-attempt numbering; null when only a
   *  total count is available. */
  attempt: number | null;
  occurrenceCount: number;
  /** Hour-bucket grain, matching `record_db_error_event`'s own upsert grain —
   *  a storm is scoped to what happened within one bucket, never summed
   *  across the whole lookback window (that would over-count a chronic low
   *  background rate as a spike). */
  timeBucket: string;
}

export interface RetryStormFinding {
  kind: RetryStormKind;
  fingerprint: string;
  timeBucket: string;
  /** The larger of `attempt` and `occurrenceCount` — whichever signal the
   *  caller had. */
  attemptsObserved: number;
  threshold: number;
}

/** Storm thresholds, one per named mechanism. `postgrest_client_retry` is
 *  literally brief §54's own example ("PGRST003 x10 client retries").
 *  `auth_getuser_storm`'s higher bar reflects that `getUser()` is called far
 *  more often in ordinary operation than a mutation retry, so the same "10"
 *  would fire on routine traffic. */
const STORM_THRESHOLDS: Readonly<Record<RetryStormKind, number>> = {
  postgrest_client_retry: 10,
  realtime_reconnect_loop: 5,
  auth_getuser_storm: 20,
  pg_net_unbounded_retry: 10,
};

export function detectRetryStorm(events: readonly RetryStormEvent[]): RetryStormFinding[] {
  const findings: RetryStormFinding[] = [];
  for (const event of events) {
    if (event.mechanism === 'other') continue;
    const threshold = STORM_THRESHOLDS[event.mechanism];
    const attemptsObserved = Math.max(event.attempt ?? 0, event.occurrenceCount);
    if (attemptsObserved >= threshold) {
      findings.push({
        kind: event.mechanism,
        fingerprint: event.fingerprint,
        timeBucket: event.timeBucket,
        attemptsObserved,
        threshold,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Workload classification — brief §55
// ---------------------------------------------------------------------------

/**
 * The EXACT `source_class` check-constraint values
 * `20260903180200_helm_debug_db_stat_deltas.sql` defines and
 * `helm_debug_stat_statements_snapshot()` computes in SQL. This is
 * deliberately NOT a second vocabulary — the brief's own prose names
 * ("product / realtime_logical_replication / pg_net / observability /
 * maintenance / unknown") are an approximate gloss, not a literal schema; the
 * literal one is this list, read from the migration and
 * `src/app/api/cron/db-stat-delta/route.ts` before writing this file. A
 * caller with `pg_cron_job` workload (the maintenance-shaped one) gets that
 * label, not an invented `'maintenance'` string.
 */
export const WORKLOAD_SOURCE_CLASSES = [
  'helm_product',
  'supabase_realtime',
  'pg_net_job',
  'pg_cron_job',
  'observability',
  'unknown',
] as const;
export type WorkloadSourceClass = (typeof WORKLOAD_SOURCE_CLASSES)[number];

const KNOWN_SOURCE_CLASSES: ReadonlySet<string> = new Set(WORKLOAD_SOURCE_CLASSES);

/**
 * Validates and defaults an already-computed `source_class` value (from
 * `StatDeltaRow.sourceClass`, `src/lib/admin/database/performance.ts`) into
 * the closed `WorkloadSourceClass` union. Never derives a class from a query
 * shape itself — that classification already happened in SQL at collection
 * time (brief §16); this function's only job is to keep an unexpected string
 * (a schema drift between the check constraint and this list, or a genuinely
 * malformed row) from propagating as a fabricated new category.
 */
export function classifyWorkload(sourceClass: string | null | undefined): WorkloadSourceClass {
  if (sourceClass && KNOWN_SOURCE_CLASSES.has(sourceClass)) {
    return sourceClass as WorkloadSourceClass;
  }
  return 'unknown';
}

/**
 * Sums `totalExecMsDelta`-shaped values by workload class — the "before vs
 * after a new publication" budget panel brief §55 asks for. Takes a plain
 * `{ sourceClass, ms }[]` rather than importing `StatDeltaRow` so this file
 * has no dependency on `performance.ts`'s exact row shape; the reader maps
 * `StatDeltaRow[]` into this shape at the call site.
 */
export function computeWorkloadBudget(
  rows: readonly { sourceClass: string | null | undefined; ms: number | null }[],
): Record<WorkloadSourceClass, number> {
  const budget: Record<WorkloadSourceClass, number> = {
    helm_product: 0,
    supabase_realtime: 0,
    pg_net_job: 0,
    pg_cron_job: 0,
    observability: 0,
    unknown: 0,
  };
  for (const row of rows) {
    const cls = classifyWorkload(row.sourceClass);
    budget[cls] += row.ms ?? 0;
  }
  return budget;
}
