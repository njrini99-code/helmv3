/**
 * Reliability collector — pure folding logic.
 *
 * No I/O lives here on purpose: everything below is a deterministic function of
 * its arguments, so the interesting behaviour (cross-source correlation, status
 * degradation, truncation accounting) is unit-testable without a network or a
 * database.
 */

import { buildIncidentSignature, normalizeIncidentRoute } from '@/lib/admin/incident-grouping';
import { redactFreeTextForStorage } from '@/lib/observability/redact-pii';
import type {
  CorrelatedSignal,
  ReliabilitySeverity,
  ReliabilitySource,
  RiskTier,
  SourceResult,
  SourceStatus,
} from './types';

/**
 * The collector's own `background_job_logs.job_type`.
 *
 * Exported because the Supabase arm MUST exclude the collector's own emissions
 * from what it reads. `helm-debug-prune` writes an `admin_events` row with
 * `source='cron'` when it fails, and this collector reads `admin_events` — so
 * without an exclusion one failed run becomes a signal, which becomes a triage
 * item, which produces another error row on the next pass. The Bridge already
 * carries a scar from this exact shape: `rca_analysis` rows had to be excluded
 * from every incident query, because an analysis of an incident was being
 * counted as another occurrence of the incident it analyzed.
 */
export const RELIABILITY_JOB_TYPE = 'reliability-triage';

/**
 * The DETAILED snapshot row's job type — deliberately distinct from the cron's
 * own.
 *
 * Two rows are written per run, because the two jobs are genuinely different:
 *
 * 1. `recordJobRun('reliability-triage', …)` writes the standard cron-board row.
 *    Every registered cron must call it — `cron-job-log-coverage.test.ts`
 *    enforces exactly that — and it is what makes the Jobs board able to say
 *    this cron ran on time.
 * 2. This job type carries the correlated payload the Reliability tab renders.
 *
 * They cannot be one row. `recordJobRun`'s `extractOutcomeMetadata` keeps only
 * TOP-LEVEL SCALARS and drops arrays and nested objects by design (a bound that
 * exists so a pathological response body cannot bloat the row) — so `signals[]`
 * and `sources[]` would be silently stripped, and the tab would render every run
 * as "recorded but unreadable". Writing the payload under its own job type keeps
 * both contracts intact without weakening that bound.
 */
export const RELIABILITY_SNAPSHOT_JOB_TYPE = 'reliability-snapshot';

/**
 * The exact title `recordJobRun` gives the `admin_events` row it writes when a
 * cron fails (`Cron failed: <jobType>`, job-log.ts).
 *
 * This is the self-emission the Supabase arm must not read back, and having the
 * real string here — rather than an approximation — is what makes the exclusion
 * test a genuine guard instead of a plausible-looking one.
 */
export const RELIABILITY_SELF_EVENT_TITLE = `Cron failed: ${RELIABILITY_JOB_TYPE}`;

/** Post-correlation cap. Beyond this the tail is counted, not stored. */
export const MAX_STORED_SIGNALS = 60;

/** Text caps — these rows are read back by the Bridge, not by a log viewer. */
const TITLE_MAX = 160;
const SUMMARY_MAX = 400;

const SEVERITY_RANK: Record<ReliabilitySeverity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

/**
 * Worst arm wins.
 *
 * `blind` outranks `degraded` outranks `partial` outranks `ok`, so a run
 * whose Sentry arm could not authenticate can never present itself as a
 * clean run. `degraded` sits below `blind` deliberately — it means a rate
 * limit survived a retry, a cause that usually clears on its own, which is a
 * materially better story than a dead credential or an unreachable provider.
 * This is the single function standing between "we checked three sources and
 * found nothing" and "we checked one source and found nothing".
 */
export function worstStatus(statuses: SourceStatus[]): SourceStatus {
  if (statuses.includes('blind')) return 'blind';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.includes('partial')) return 'partial';
  return 'ok';
}

/**
 * Advisory risk tier, deliberately conservative.
 *
 * Anything touching auth, RLS, migrations, billing or secrets is R3 — the OS
 * reserves those for owner execution, and a wrong guess in the cautious
 * direction costs a human glance while a wrong guess the other way is how an
 * unattended agent ends up editing a policy. Nothing consumes this yet; it
 * exists so the tier is visible before anything is wired to act on it.
 */
export function proposeRisk(input: {
  severity: ReliabilitySeverity;
  route: string | null;
  errorCode: string | null;
  title: string;
}): RiskTier {
  const haystack = `${input.route ?? ''} ${input.errorCode ?? ''} ${input.title}`.toLowerCase();

  const privileged = [
    'auth', 'rls', 'policy', 'permission', 'migration', 'billing', 'stripe',
    'secret', 'token', 'service_role', 'grant', 'password', 'session',
  ];
  if (privileged.some((needle) => haystack.includes(needle))) return 'R3';

  if (input.severity === 'critical') return 'R2';
  if (input.severity === 'error') return 'R2';
  if (input.severity === 'warning') return 'R1';
  return 'R0';
}

/**
 * Advisory route → feature mapping.
 *
 * Deliberately a coarse prefix match and NOT presented as authoritative:
 * `memory/registry.yml` is the canonical router per the OS contract, and it is
 * a build-time artifact this runtime path cannot read. A null here means "not
 * attributed", never "no feature".
 *
 * Lives here (not in `collect.ts`) so it is reachable, pure, with no I/O, from
 * both the collector's own correlation pass AND `mergeTriage`
 * (`src/lib/admin/data/triage.ts`) — a Sentry issue's `culprit` is the only
 * per-issue location signal the Sentry issue-LIST endpoint returns (no
 * transaction/url field on `SentryIssue`), and it is exactly what this
 * function already expects: `collectSentry` in `sources.ts` passes
 * `issue.culprit` as `route` into the same function today.
 *
 * NOT every value this returns is a `FEATURE_REGISTRY` key
 * (`src/lib/admin/feature-registry.ts`) — `stats_analytics`, `qualifiers` and
 * `calendar_events` are; `golf_round_lifecycle`, `coachhelm_ai` and
 * `admin_platform` are not. That mismatch predates this comment (the
 * Reliability tab's own `CorrelatedSignal.featureId` has used this exact
 * function since the collector shipped) and is left as-is here rather than
 * silently reinterpreted: an unregistered id still renders, unlinked, in the
 * feature lens (`UnifiedIncidentCard` — "not a key in the feature registry —
 * it counts against no feature's health and cannot be filtered on"), which is
 * strictly better than the "unknown" bucket this fixes Sentry-origin signals
 * out of.
 */
export function resolveFeatureId(route: string | null): string | null {
  if (!route) return null;
  const r = route.toLowerCase();
  if (r.includes('/rounds') || r.includes('round')) return 'golf_round_lifecycle';
  if (r.includes('/qualifier')) return 'qualifiers';
  if (r.includes('/stats') || r.includes('/analytics')) return 'stats_analytics';
  if (r.includes('/coachhelm')) return 'coachhelm_ai';
  if (r.includes('/admin')) return 'admin_platform';
  if (r.includes('/calendar') || r.includes('/events')) return 'calendar_events';
  return null;
}

function pickWorseSeverity(a: ReliabilitySeverity, b: ReliabilitySeverity): ReliabilitySeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

/**
 * The severity used to build a correlation key. Its VALUE is irrelevant — what
 * matters is that it is constant.
 */
const CORRELATION_SEVERITY: ReliabilitySeverity = 'error';

/**
 * Severity-independent correlation key.
 *
 * `buildIncidentSignature` folds severity INTO its key
 * (`severity::errorCode::route::messagePrefix`). That is right for its original
 * callers, which group rows arriving from a single source through a single
 * writer. It is wrong for cross-source correlation, and quietly so: Sentry
 * reports `level: 'error'` for plenty of conditions this app logs to
 * `admin_events` as `warning`, so one root cause would produce two signatures,
 * two entries, and never the "confirmed by 2 sources" badge that is the entire
 * reason this tab exists separately from the Errors tab.
 *
 * Passing a FIXED severity yields the `errorCode::route::messagePrefix` half of
 * the same key, under the same normalisation rules (route ids collapsed, UUIDs
 * and long hex masked, 80-char message prefix), and lets `pickWorseSeverity`
 * carry severity across the fold instead of the key silently partitioning on it.
 *
 * Consequence worth being precise about, because a doc claiming otherwise would
 * rot: the value returned here is deliberately NOT equal to the row's stored
 * `admin_events.fingerprint`, which was computed with that row's real severity.
 * What is shared with the Errors tab and the Golf Tracer is the normalisation
 * function and therefore the notion of what counts as "the same failure" — not
 * the literal hash. Within the Supabase arm, rows are still pre-grouped on the
 * stored fingerprint before they ever reach this function.
 */
export function correlationSignature(input: {
  errorCode: string | null;
  route: string | null;
  message: string;
}): string {
  return buildIncidentSignature({ ...input, severity: CORRELATION_SEVERITY });
}

/**
 * Fold every arm's raw signals into one deduped, severity-ratcheted set.
 *
 * Correlation key is `buildIncidentSignature` — the same signature already
 * written to `admin_events.fingerprint` — so a Sentry issue and a Supabase row
 * describing one root cause land in one entry, and the result stays consistent
 * with the Errors tab and Golf Tracer groupings.
 *
 * Returns the capped list plus how many were dropped, because a silent cap on
 * an operational dashboard reads as completeness.
 */
export function correlateSignals(
  results: SourceResult[],
  resolveFeatureId: (route: string | null) => string | null = () => null,
  maxStored: number = MAX_STORED_SIGNALS,
): { signals: CorrelatedSignal[]; truncatedSignals: number } {
  const buckets = new Map<string, CorrelatedSignal>();

  for (const result of results) {
    for (const raw of result.signals) {
      // Severity-independent on purpose — see `correlationSignature`. Using
      // the severity-bearing key here would partition one root cause across
      // sources that rate it differently, which is the common case.
      const signature = correlationSignature({
        errorCode: raw.errorCode,
        route: raw.route,
        message: raw.message,
      });

      // Redact at the boundary: these strings are written to a table an admin
      // reads and an RCA action may forward to a third-party model. The
      // admin-platform feature doc is explicit that message/title/stack count
      // as error text, not just url/context.
      const title = redactFreeTextForStorage(raw.title || raw.message, TITLE_MAX);
      const route = raw.route ? normalizeIncidentRoute(raw.route) : null;

      const existing = buckets.get(signature);
      if (!existing) {
        buckets.set(signature, {
          signature,
          severity: raw.severity,
          title,
          summary: redactFreeTextForStorage(raw.message, SUMMARY_MAX),
          route,
          errorCode: raw.errorCode,
          count: raw.count,
          firstSeen: raw.firstSeen,
          lastSeen: raw.lastSeen,
          sources: [raw.source],
          featureId: resolveFeatureId(route),
          proposedRisk: proposeRisk({
            severity: raw.severity,
            route,
            errorCode: raw.errorCode,
            title,
          }),
          evidence: raw.evidenceRef
            ? [{ source: raw.source, ref: raw.evidenceRef }]
            : [],
        });
        continue;
      }

      existing.count += raw.count;
      existing.severity = pickWorseSeverity(existing.severity, raw.severity);
      if (raw.firstSeen < existing.firstSeen) existing.firstSeen = raw.firstSeen;
      if (raw.lastSeen > existing.lastSeen) existing.lastSeen = raw.lastSeen;
      if (!existing.sources.includes(raw.source)) existing.sources.push(raw.source);
      // Dedupe on the PAIR, and keep the source attached. Two sources can
      // legitimately report the same ref string, and one source routinely
      // contributes several — neither case survives index-based pairing.
      if (
        raw.evidenceRef &&
        !existing.evidence.some((e) => e.source === raw.source && e.ref === raw.evidenceRef)
      ) {
        existing.evidence.push({ source: raw.source, ref: raw.evidenceRef });
      }
      // Severity may have worsened; the tier is derived from it, so re-derive.
      existing.proposedRisk = proposeRisk({
        severity: existing.severity,
        route: existing.route,
        errorCode: existing.errorCode,
        title: existing.title,
      });
    }
  }

  // Rank by operator attention: corroborated across sources first (two arms
  // agreeing is stronger evidence than one arm shouting), then severity, then
  // volume, then recency.
  const ordered = Array.from(buckets.values()).sort((a, b) => {
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length;
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    if (b.count !== a.count) return b.count - a.count;
    return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
  });

  return {
    signals: ordered.slice(0, maxStored),
    truncatedSignals: Math.max(0, ordered.length - maxStored),
  };
}

/** Map a source list to the metadata-safe shape (signals live at the top level). */
export function summarizeSources(
  results: SourceResult[],
): Array<Omit<SourceResult, 'signals'>> {
  return results.map(({ signals: _signals, ...rest }) => rest);
}

/** True when any arm is blind — the Bridge renders this as a warning band. */
export function hasBlindSource(results: Array<{ status: SourceStatus }>): boolean {
  return results.some((r) => r.status === 'blind');
}

export type { ReliabilitySource };
