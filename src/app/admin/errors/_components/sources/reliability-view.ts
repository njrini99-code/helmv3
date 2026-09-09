/**
 * Reliability tab — pure view helpers.
 *
 * Split out of `page.tsx` for the same reason `tracer-shared.ts` exists: the
 * interesting decisions here (what an evidence reference points at, how the
 * severity mix is counted, what the history series contains) are worth testing
 * without rendering a server component.
 */

import type {
  CorrelatedSignal,
  ReliabilitySeverity,
  ReliabilitySource,
  SourceStatus,
} from '@/lib/reliability/types';
import type { ReliabilityRunRow } from '@/lib/admin/data/reliability';

export const SEVERITY_ORDER: readonly ReliabilitySeverity[] = [
  'critical',
  'error',
  'warning',
  'info',
];

/**
 * What an evidence reference actually points at.
 *
 * The three arms store structurally different references, and rendering them
 * all as plain text was the first draft's real cost: a Sentry permalink is a
 * working URL to the stack trace, and printing it as grey text next to a
 * clickable-looking row is worse than useless. An `admin_events` fingerprint is
 * not a URL at all — it addresses the Bridge's own detail page — and a Vercel
 * deployment id addresses neither.
 */
export type EvidenceTarget =
  | { kind: 'external'; href: string; label: string }
  | { kind: 'internal'; href: string; label: string }
  | { kind: 'opaque'; label: string };

const FINGERPRINT_RE = /^[0-9a-f]{8}$/i;

export function evidenceTarget(ref: string, source: ReliabilitySource): EvidenceTarget {
  if (/^https?:\/\//i.test(ref)) {
    // Sentry permalinks. Labelled by issue short-id where the URL carries one,
    // because "sentry.io/organizations/…/issues/4512/" is not a label.
    const tail = ref.replace(/\/+$/, '').split('/').pop();
    return {
      kind: 'external',
      href: ref,
      label: tail && /^\d+$/.test(tail) ? `Sentry #${tail}` : 'Sentry issue',
    };
  }

  // An 8-char hex value is a `buildIncidentSignature` fingerprint, which the
  // Bridge already has a detail page for — so this becomes a real drill-through
  // into the Errors tab rather than a string to copy by hand.
  if (source === 'supabase' && FINGERPRINT_RE.test(ref)) {
    return {
      kind: 'internal',
      href: `/admin/errors/${ref}`,
      label: `Incident ${ref}`,
    };
  }

  if (source === 'vercel') {
    return { kind: 'opaque', label: `Deployment ${ref.slice(0, 12)}` };
  }

  return { kind: 'opaque', label: ref.slice(0, 24) };
}

/** Severity mix across the correlated set, in fixed display order. */
export function severityCounts(
  signals: readonly CorrelatedSignal[],
): Record<ReliabilitySeverity, number> {
  const counts: Record<ReliabilitySeverity, number> = {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
  };
  for (const signal of signals) counts[signal.severity] += 1;
  return counts;
}

/** Signals seen by more than one source — the corroborated set. */
export function corroboratedCount(signals: readonly CorrelatedSignal[]): number {
  return signals.filter((s) => s.sources.length > 1).length;
}

/** Signals a human should look at now: critical or error. */
export function needsAttentionCount(signals: readonly CorrelatedSignal[]): number {
  return signals.filter((s) => s.severity === 'critical' || s.severity === 'error').length;
}

/**
 * Signal counts across recent runs, OLDEST → NEWEST for the sparkline.
 *
 * Runs whose payload could not be parsed are skipped rather than plotted as
 * zero: a zero on this chart means "the collector looked and found nothing",
 * and an unreadable row means the opposite — that we do not know.
 */
export function historySeries(history: readonly ReliabilityRunRow[]): number[] {
  return history
    .filter((row) => row.run !== null)
    .map((row) => row.run!.signals.length)
    .reverse();
}

export interface SourceHealth {
  source: ReliabilitySource;
  status: SourceStatus;
  reason: string | null;
  durationMs: number;
  bounded: boolean;
}

/** How many arms actually returned data. Never counts a blind or degraded
 *  arm — a `degraded` (rate-limited-after-retry) arm returned no data for
 *  this run either, same as `blind`; only the reason differs. */
export function readingCount(sources: readonly { status: SourceStatus }[]): number {
  return sources.filter((s) => s.status !== 'blind' && s.status !== 'degraded').length;
}

/**
 * Signals grouped for display, worst first, empty buckets omitted.
 *
 * Grouping by severity rather than showing one flat list is what makes the page
 * scannable at the density an operator needs: the question is "what should I
 * look at", and a `critical` two thirds down a list of forty `info` rows does
 * not answer it.
 */
export function groupBySeverity(
  signals: readonly CorrelatedSignal[],
): Array<{ severity: ReliabilitySeverity; signals: CorrelatedSignal[] }> {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    signals: signals.filter((s) => s.severity === severity),
  })).filter((group) => group.signals.length > 0);
}

/** Compact "3m ago" / "2h ago" for dense rows where a full timestamp is noise. */
export function relativeAge(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Signals grouped by how many INDEPENDENT SOURCES saw them, most-corroborated
 * first.
 *
 * WHY THIS REPLACED SEVERITY AS THE PRIMARY AXIS ON THIS TAB. Severity is the
 * Incidents tab's axis, and grouping by it here made Reliability read as a
 * second, differently-sorted copy of the same queue — which is exactly the
 * split-brain the unified incident model exists to end. This tab's unique
 * contribution is not "what is worst"; it is "what do multiple independent
 * systems agree on", which no other surface can compute.
 *
 * The count is an OBSERVATION COUNT, never a confidence score. Two sources
 * seeing a fault is a mechanical fact about coverage; it says nothing about how
 * likely the fault is to be real, and labelling it confidence would invent a
 * calibration this system does not have.
 *
 * `groupBySeverity` is kept and still exported: the severity mix panel uses it,
 * and deleting a tested pure helper to make a layout change would be a wider
 * blast radius than the change deserves.
 */
export function groupByCorroboration(
  signals: readonly CorrelatedSignal[],
): Array<{ sourceCount: number; signals: CorrelatedSignal[] }> {
  const byCount = new Map<number, CorrelatedSignal[]>();
  for (const signal of signals) {
    const key = signal.sources.length;
    const bucket = byCount.get(key) ?? [];
    bucket.push(signal);
    byCount.set(key, bucket);
  }
  return [...byCount.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([sourceCount, group]) => ({
      sourceCount,
      // Within a bucket, worst severity first — the corroboration question is
      // answered by the grouping, so severity is free to order inside it.
      signals: [...group].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
      ),
    }));
}

/**
 * The Bridge link for a correlated signal.
 *
 * Every row on this tab is a DOOR into the canonical incident, not a leaf. The
 * nightly triage stores a reliability signal's analysis under
 * `rel:<signature>`, and `/admin/errors/<id>` resolves that spelling — so the
 * same string is both the storage key and the route, and no translation table
 * can drift between them.
 */
export function signalIncidentHref(signature: string): string {
  return `/admin/errors/${encodeURIComponent(`rel:${signature}`)}`;
}

/** One cell of the coverage matrix: what one source did on one run. */
export type CoverageCell = 'reading' | 'partial' | 'blind' | 'no-run';

export interface CoverageRow {
  source: ReliabilitySource;
  /** Oldest first, so the matrix reads left-to-right as time. */
  cells: CoverageCell[];
  readingRuns: number;
  totalRuns: number;
}

/**
 * "Was the system actually watching?" — per source, across the recent runs.
 *
 * A single current-status pill answers "is Sentry readable right now", which is
 * the less useful question: a source that was blind for three hours overnight
 * and recovered at 6am reads as perfectly healthy on a pill, and every count
 * computed during those three hours was quietly partial. The matrix makes the
 * hole visible after the fact, which is when an operator actually asks.
 *
 * A run whose metadata could not be parsed (`row.run === null`) yields
 * `'no-run'` for every source — DISTINCT from `'blind'`. One means the
 * collector's own record is unreadable; the other means the collector ran and
 * could not reach that provider. Collapsing them would attribute an infra
 * problem to a provider outage.
 */
export function buildCoverageMatrix(
  history: readonly ReliabilityRunRow[],
  sources: readonly ReliabilitySource[] = ['sentry', 'supabase', 'vercel'],
): CoverageRow[] {
  // `history` arrives newest-first from the data layer; the matrix reads as
  // time, so it is reversed once here rather than at each cell.
  const chronological = [...history].reverse();
  return sources.map((source) => {
    const cells = chronological.map((row): CoverageCell => {
      if (!row.run) return 'no-run';
      const arm = row.run.sources.find((s) => s.source === source);
      if (!arm) return 'no-run';
      return arm.status === 'ok' ? 'reading' : arm.status === 'partial' ? 'partial' : 'blind';
    });
    return {
      source,
      cells,
      readingRuns: cells.filter((c) => c === 'reading').length,
      totalRuns: cells.length,
    };
  });
}
