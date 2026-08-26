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
 * `blind` outranks `partial` outranks `ok`, so a run whose Sentry arm could not
 * authenticate can never present itself as a clean run. This is the single
 * function standing between "we checked three sources and found nothing" and
 * "we checked one source and found nothing".
 */
export function worstStatus(statuses: SourceStatus[]): SourceStatus {
  if (statuses.includes('blind')) return 'blind';
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

function pickWorseSeverity(a: ReliabilitySeverity, b: ReliabilitySeverity): ReliabilitySeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
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
      const signature = buildIncidentSignature({
        severity: raw.severity,
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
          evidenceRefs: raw.evidenceRef ? [raw.evidenceRef] : [],
        });
        continue;
      }

      existing.count += raw.count;
      existing.severity = pickWorseSeverity(existing.severity, raw.severity);
      if (raw.firstSeen < existing.firstSeen) existing.firstSeen = raw.firstSeen;
      if (raw.lastSeen > existing.lastSeen) existing.lastSeen = raw.lastSeen;
      if (!existing.sources.includes(raw.source)) existing.sources.push(raw.source);
      if (raw.evidenceRef && !existing.evidenceRefs.includes(raw.evidenceRef)) {
        existing.evidenceRefs.push(raw.evidenceRef);
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
