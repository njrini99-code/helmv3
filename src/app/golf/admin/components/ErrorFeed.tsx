'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { resolveDashboardIncident } from '@/app/golf/actions/admin-data';
import { buildIncidentSignature } from '@/lib/admin/incident-grouping';
import { cn } from '@/lib/utils';
import {
  IconLayers3,
  IconRotateCcw,
  IconWarning,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClipboard,
  IconShieldAlert,
  IconUser,
} from '@/components/icons';
import { timeAgo } from './admin-utils';

interface Props {
  errorLogs: AdminDashboardData['errorLogs'];
}

type QueueTab = 'active' | 'resolved';
type FeedMode = 'all' | 'open' | 'recent' | 'backlog';
type IncidentStatus = AdminDashboardData['errorLogs']['recentErrors'][number]['status'];

const severityStyles: Record<'critical' | 'error' | 'warning' | 'info', {
  badge: string;
  border: string;
  icon: string;
}> = {
  critical: {
    badge: 'bg-red-100 text-red-700 border-red-200',
    border: 'border-red-200',
    icon: 'text-red-600',
  },
  error: {
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    border: 'border-rose-200',
    icon: 'text-rose-600',
  },
  warning: {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    border: 'border-amber-200',
    icon: 'text-amber-600',
  },
  info: {
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    border: 'border-blue-200',
    icon: 'text-blue-600',
  },
};

const statusStyles: Record<IncidentStatus, {
  badge: string;
  label: string;
}> = {
  open: {
    badge: 'bg-red-100 text-red-700 border-red-200',
    label: 'Open',
  },
  active: {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    label: 'Active',
  },
  resolved: {
    badge: 'bg-primary-100 text-primary-700 border-primary-200',
    label: 'Resolved',
  },
  historical: {
    badge: 'bg-warm-100 text-warm-600 border-warm-200',
    label: 'Backlog',
  },
};

function getSeverityStyle(severity: string): (typeof severityStyles)['critical'] {
  return severityStyles[severity as keyof typeof severityStyles] ?? severityStyles.error;
}

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (copied) return;
  }

  throw new Error('Clipboard unavailable');
}

function CompactStat({ label, value, detail, tone = 'default' }: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'default' | 'danger' | 'success';
}) {
  return (
    <div className={cn(
      'rounded-xl border px-2.5 py-2 sm:px-3 min-w-0 overflow-hidden',
      tone === 'danger'
        ? 'border-red-100 bg-red-50/65'
        : tone === 'success'
          ? 'border-primary-100 bg-primary-50/65'
          : 'border-white/35 bg-white/60'
    )}>
      <p className={cn(
        'text-[10px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] truncate',
        tone === 'danger'
          ? 'text-red-500'
          : tone === 'success'
            ? 'text-primary-600'
            : 'text-warm-400'
      )}>
        {label}
      </p>
      <div className="mt-1 flex items-end gap-1.5 sm:gap-2 min-w-0">
        <p className={cn(
          'text-base font-semibold tabular-nums shrink-0',
          tone === 'danger'
            ? 'text-red-700'
            : tone === 'success'
              ? 'text-primary-700'
              : 'text-warm-900'
        )}>
          {value}
        </p>
        <p className={cn(
          'pb-0.5 text-[10px] sm:text-[11px] truncate min-w-0',
          tone === 'danger'
            ? 'text-red-600'
            : tone === 'success'
              ? 'text-primary-600'
              : 'text-warm-500'
        )}>
          {detail}
        </p>
      </div>
    </div>
  );
}

function MetaItem({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;

  return (
    <div className="rounded-xl border border-white/40 bg-white/65 px-3 py-2 min-w-0 overflow-hidden">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">{label}</p>
      <p className={cn(
        'mt-1 break-all text-xs leading-5 text-warm-800',
        mono && 'font-mono'
      )}>
        {value}
      </p>
    </div>
  );
}

function NarrativePanel({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/40 bg-white/65 p-3 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">{label}</p>
      <p className="mt-1.5 text-sm leading-6 text-warm-700 break-words">{body}</p>
    </div>
  );
}

export function ErrorFeed({ errorLogs }: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState<QueueTab>('active');
  const [feedMode, setFeedMode] = useState<FeedMode>('all');
  const [copyState, setCopyState] = useState<{ target: string; status: 'success' | 'error' } | null>(null);
  const [resolveState, setResolveState] = useState<{ target: string; status: 'success' | 'error'; message: string } | null>(null);
  const [pendingIncidentId, setPendingIncidentId] = useState<string | null>(null);
  const [optimisticallyResolved, setOptimisticallyResolved] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const { totalErrors7d, criticalErrors7d, recentErrors: serverErrors } = errorLogs;

  // Apply optimistic resolution status to incidents
  const recentErrors = serverErrors.map((incident) => {
    if (optimisticallyResolved.has(incident.id) && incident.status !== 'resolved') {
      return { ...incident, status: 'resolved' as const, resolvedAt: new Date().toISOString() };
    }
    return incident;
  });

  // Smart incident grouping. The server already groups events into
  // `recentErrors` rows by message-key, but slight wording variations on the
  // same root cause (different round IDs, e.g. the recurring `ON CONFLICT
  // specification` predictor error) still produce many near-duplicate cards.
  // Re-merge here using the shared signature so the operator sees one row per
  // distinct signature with its occurrence count, not 27 carbon copies.
  type MergedIncident = (typeof recentErrors)[number] & {
    underlyingIncidents: typeof recentErrors;
    groupOccurrences: number;
    groupAffectedUsers: number;
    signature: string;
  };

  const mergedIncidents: MergedIncident[] = useMemo(() => {
    const buckets = new Map<string, typeof recentErrors>();
    for (const incident of recentErrors) {
      const sig = buildIncidentSignature({
        severity: (incident.severity as 'critical' | 'error' | 'warning' | 'info') ?? 'error',
        errorCode: incident.errorCode,
        route: incident.route ?? incident.url ?? null,
        message: incident.message,
      });
      const existing = buckets.get(sig);
      if (existing) existing.push(incident);
      else buckets.set(sig, [incident]);
    }

    return Array.from(buckets.entries()).map(([signature, group]) => {
      // Sort underlying incidents newest-first so the head one drives the card.
      const sorted = [...group].sort((a, b) =>
        new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
      );
      const head = sorted[0]!;
      const groupOccurrences = group.reduce((sum, inc) => sum + (inc.occurrences ?? 1), 0);
      // affectedUsers per row already counts unique users per group, so we
      // approximate the union by summing — overcount risk is small in
      // practice and the field is already a soft signal.
      const groupAffectedUsers = group.reduce((sum, inc) => sum + (inc.affectedUsers ?? 0), 0);
      // Promote the worst severity in the bucket (matches the server-side ratchet).
      const severityRank: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };
      const worstSeverity = group.reduce((worst, inc) =>
        (severityRank[inc.severity] ?? 99) < (severityRank[worst] ?? 99) ? inc.severity : worst,
        head.severity,
      );
      // A merged card is "resolved" only if every underlying incident is.
      const hasOpen = group.some((inc) => inc.status !== 'resolved');
      const mergedStatus = hasOpen
        ? group.some((inc) => inc.status === 'open') ? 'open' as const
          : group.some((inc) => inc.status === 'active') ? 'active' as const
          : 'historical' as const
        : 'resolved' as const;
      const mergedFirstSeen = group.reduce(
        (min, inc) => (new Date(inc.firstSeen).getTime() < new Date(min).getTime() ? inc.firstSeen : min),
        head.firstSeen,
      );

      return {
        ...head,
        severity: worstSeverity,
        status: mergedStatus,
        firstSeen: mergedFirstSeen,
        underlyingIncidents: sorted,
        groupOccurrences,
        groupAffectedUsers,
        signature,
        // Override per-card occurrences/affectedUsers so the existing render
        // path picks up the merged totals without further changes.
        occurrences: groupOccurrences,
        affectedUsers: groupAffectedUsers,
      } satisfies MergedIncident;
    });
  }, [recentErrors]);

  const activeIncidents = mergedIncidents.filter((incident) => incident.status !== 'resolved');
  const resolvedIncidents = [...mergedIncidents]
    .filter((incident) => incident.status === 'resolved')
    .sort((a, b) => new Date(b.resolvedAt ?? b.lastSeen).getTime() - new Date(a.resolvedAt ?? a.lastSeen).getTime());

  const visibleIncidents = (() => {
    if (queueTab === 'resolved') return resolvedIncidents;
    return activeIncidents.filter((incident) => {
      if (feedMode === 'open') return incident.status === 'open';
      if (feedMode === 'recent') return incident.status === 'open' || incident.status === 'active';
      if (feedMode === 'backlog') return incident.status === 'historical';
      return true;
    });
  })();

  const setCopyFeedback = (target: string, status: 'success' | 'error') => {
    setCopyState({ target, status });
    window.setTimeout(() => {
      setCopyState((current) => (current?.target === target ? null : current));
    }, 2200);
  };

  const setResolveFeedback = (target: string, status: 'success' | 'error', message: string) => {
    setResolveState({ target, status, message });
    window.setTimeout(() => {
      setResolveState((current) => (current?.target === target ? null : current));
    }, 3200);
  };

  const handleCopy = async (text: string, target: string) => {
    try {
      await copyText(text);
      setCopyFeedback(target, 'success');
    } catch {
      setCopyFeedback(target, 'error');
    }
  };

  const handleResolve = (incident: MergedIncident) => {
    setPendingIncidentId(incident.id);
    // Optimistic UI: immediately mark every underlying incident in the group as resolved.
    setOptimisticallyResolved((prev) => {
      const next = new Set(prev);
      for (const underlying of incident.underlyingIncidents) next.add(underlying.id);
      return next;
    });
    setQueueTab('resolved');
    setExpandedId(incident.id);
    startTransition(async () => {
      try {
        // Resolve every underlying incident in the signature group. Each call
        // hits the same server action that the per-card flow used; we fan out
        // here so a single click resolves all variants of the same root cause.
        const results = await Promise.all(
          incident.underlyingIncidents.map((underlying) =>
            resolveDashboardIncident({
              incidentKey: underlying.id,
              title: underlying.title,
              message: underlying.message,
              severity: underlying.severity,
              route: underlying.route,
              url: underlying.url,
              action: underlying.action,
              featureArea: underlying.featureArea,
              errorCode: underlying.errorCode,
              source: underlying.source,
            }).catch((error) => ({
              success: false,
              resolvedCount: 0,
              message: error instanceof Error ? error.message : 'Could not resolve incident.',
            })),
          ),
        );
        const allOk = results.every((r) => r.success);
        const totalResolved = results.reduce((sum, r) => sum + (r.resolvedCount ?? 0), 0);
        const message = allOk
          ? `Resolved ${incident.underlyingIncidents.length} incident${incident.underlyingIncidents.length === 1 ? '' : 's'} (${totalResolved} admin event${totalResolved === 1 ? '' : 's'}).`
          : results.find((r) => !r.success)?.message ?? 'One or more incidents in this group could not be resolved.';
        setResolveFeedback(incident.id, allOk ? 'success' : 'error', message);
        if (allOk) {
          router.refresh();
        } else {
          // Rollback optimistic update on partial failure so the operator can retry.
          setOptimisticallyResolved((prev) => {
            const next = new Set(prev);
            for (const underlying of incident.underlyingIncidents) next.delete(underlying.id);
            return next;
          });
          setQueueTab('active');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not resolve incident.';
        setResolveFeedback(incident.id, 'error', message);
        setOptimisticallyResolved((prev) => {
          const next = new Set(prev);
          for (const underlying of incident.underlyingIncidents) next.delete(underlying.id);
          return next;
        });
        setQueueTab('active');
      } finally {
        setPendingIncidentId((current) => (current === incident.id ? null : current));
      }
    });
  };

  const visibleFeedSummary = visibleIncidents
    .map((incident, index) => `${queueTab === 'resolved' ? 'Resolved' : 'Active'} Incident ${index + 1}\n${incident.copySummary}`)
    .join('\n\n====================\n\n');

  // Recompute incident counts from the optimistic-aware merged list so the
  // summary tiles stay in sync with the tab badges after marking incidents
  // resolved. Counts reflect signature-grouped cards, not raw rows.
  const liveCounts = mergedIncidents.reduce(
    (acc, incident) => {
      acc[incident.status] += 1;
      if (incident.occurrences > 1) acc.repeated += 1;
      if (incident.status === 'open' && incident.severity === 'critical') acc.openCritical += 1;
      if (
        incident.status === 'resolved' &&
        incident.resolvedAt &&
        new Date(incident.resolvedAt).getTime() >= Date.now() - 24 * 60 * 60 * 1000
      ) {
        acc.resolvedRecently += 1;
      }
      return acc;
    },
    { open: 0, active: 0, resolved: 0, historical: 0, repeated: 0, openCritical: 0, resolvedRecently: 0 }
  );

  const repeatedCount = liveCounts.repeated;
  const headerNote = queueTab === 'resolved'
    ? 'Resolved incidents are archived here with operator attribution and resolution timestamps.'
    : 'The active queue keeps open, recent, and older unresolved incidents in one compact operator feed.';

  return (
    <div className="glass-standard rounded-2xl p-3 sm:p-3.5 md:p-4 min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-red-50">
              <IconShieldAlert size={16} className="text-red-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-warm-900">Incident Command Feed</h3>
              <p className="text-xs text-warm-500 line-clamp-2 sm:line-clamp-none">{headerNote}</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleCopy(visibleFeedSummary || 'No incidents in the current view.', 'feed')}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm font-medium transition-colors shrink-0',
            copyState?.target === 'feed' && copyState.status === 'success'
              ? 'border-primary-200 bg-primary-50 text-primary-700'
              : copyState?.target === 'feed' && copyState.status === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-white/40 bg-white/70 text-warm-700 hover:bg-white'
          )}
        >
          {copyState?.target === 'feed' && copyState.status === 'success' ? <IconCheck size={16} /> : <IconClipboard size={16} />}
          {copyState?.target === 'feed' && copyState.status === 'success'
            ? 'Copied diagnostics'
            : copyState?.target === 'feed' && copyState.status === 'error'
              ? 'Copy failed'
              : 'Copy visible diagnostics'}
        </button>
      </div>

      {resolveState && (
        <div
          className={cn(
            'mt-3 rounded-xl border px-3 py-2 text-sm',
            resolveState.status === 'success'
              ? 'border-primary-100 bg-primary-50/70 text-primary-700'
              : 'border-red-100 bg-red-50/70 text-red-700'
          )}
        >
          {resolveState.message}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <CompactStat label="Raw Errors" value={totalErrors7d} detail="7d rows" />
        <CompactStat label="Open" value={liveCounts.open} detail={`${liveCounts.active} active`} tone={liveCounts.open > 0 ? 'danger' : 'default'} />
        <CompactStat label="Resolved" value={liveCounts.resolved} detail={`${liveCounts.resolvedRecently} in 24h`} tone={liveCounts.resolved > 0 ? 'success' : 'default'} />
        <CompactStat label="Repeated" value={repeatedCount} detail="multi-hit incidents" />
        <CompactStat label="Critical" value={criticalErrors7d} detail={`${liveCounts.openCritical} open critical`} tone={liveCounts.openCritical > 0 ? 'danger' : 'default'} />
      </div>

      <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            { value: 'active', label: 'Active Queue', count: activeIncidents.length },
            { value: 'resolved', label: 'Resolved', count: resolvedIncidents.length },
          ] as { value: QueueTab; label: string; count: number }[]).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setQueueTab(option.value)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                queueTab === option.value
                  ? 'border-warm-300 bg-white text-warm-900 shadow-sm'
                  : 'border-white/30 bg-white/50 text-warm-500 hover:bg-white/70'
              )}
            >
              <span>{option.label}</span>
              <span className="rounded-full bg-warm-100 px-2 py-0.5 text-xs font-semibold text-warm-600 tabular-nums">
                {option.count}
              </span>
            </button>
          ))}
        </div>

        <p className="text-xs text-warm-500">
          {queueTab === 'resolved' ? 'Resolved incidents are sorted by resolution time.' : 'Active incidents are sorted by severity, freshness, and backlog state.'}
        </p>
      </div>

      {queueTab === 'active' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            { value: 'all', label: 'All active', count: activeIncidents.length },
            { value: 'open', label: 'Open only', count: liveCounts.open },
            { value: 'recent', label: 'Open + Active', count: liveCounts.open + liveCounts.active },
            { value: 'backlog', label: 'Backlog', count: liveCounts.historical },
          ] as { value: FeedMode; label: string; count: number }[]).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFeedMode(option.value)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
                feedMode === option.value
                  ? 'border-warm-300 bg-white text-warm-900 shadow-sm'
                  : 'border-white/30 bg-white/50 text-warm-500 hover:bg-white/70'
              )}
            >
              <span>{option.label}</span>
              <span className="rounded-full bg-warm-100 px-2 py-0.5 text-[11px] font-semibold text-warm-600 tabular-nums">
                {option.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {visibleIncidents.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-white/35 bg-white/55 px-6 py-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50">
            <IconCheck size={20} className="text-primary-600" />
          </div>
          <p className="mt-3 text-sm font-semibold text-primary-700">
            {queueTab === 'resolved' ? 'No resolved incidents yet.' : 'No incidents in this active queue view.'}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {visibleIncidents.map((incident) => {
            const severityStyle = getSeverityStyle(incident.severity);
            const statusStyle = statusStyles[incident.status];
            const isExpanded = expandedId === incident.id;
            const isResolving = isPending && pendingIncidentId === incident.id;
            const footerTimestamp = incident.status === 'resolved'
              ? `${formatTimestamp(incident.resolvedAt)} · ${timeAgo(incident.resolvedAt ?? incident.lastSeen)}`
              : `${formatTimestamp(incident.lastSeen)} · ${timeAgo(incident.lastSeen)}`;

            return (
              <article
                key={incident.id}
                className={cn(
                  'rounded-xl border bg-white/55 p-3 md:p-3.5',
                  severityStyle.border,
                  incident.status === 'open' && 'ring-1 ring-red-100'
                )}
              >
                <div className="flex flex-col gap-3 sm:gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', severityStyle.badge)}>
                        {incident.severity}
                      </span>
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', statusStyle.badge)}>
                        {statusStyle.label}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-white/40 bg-white/65 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warm-600">
                        {incident.featureArea}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/65 px-2 py-0.5 text-[11px] font-medium text-warm-600">
                        <IconLayers3 size={11} />
                        {incident.occurrences}
                      </span>
                      {incident.affectedUsers > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/65 px-2 py-0.5 text-[11px] font-medium text-warm-600">
                          <IconUser size={11} />
                          {incident.affectedUsers}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-start gap-3">
                      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/80', severityStyle.icon)}>
                        <IconWarning size={16} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold leading-6 text-warm-900">
                          {incident.title}
                          {incident.groupOccurrences > 1 && (
                            <span className="ml-2 text-xs font-medium text-warm-500 tabular-nums">
                              · &times;{incident.groupOccurrences}
                            </span>
                          )}
                        </h4>
                        <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-warm-700">{incident.summary}</p>
                        <p className="mt-1 text-xs leading-5 text-warm-500">
                          {incident.diagnosisBasis}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-500 min-w-0">
                          <span
                            className="shrink-0"
                            title={incident.status === 'resolved'
                              ? new Date(incident.resolvedAt ?? incident.lastSeen).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
                              : new Date(incident.lastSeen).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
                            }
                          >{footerTimestamp}</span>
                          {incident.action && <span className="font-mono truncate max-w-[200px] sm:max-w-none">{incident.action}</span>}
                          {(incident.route ?? incident.url) && <span className="truncate max-w-[180px] sm:max-w-[300px] font-mono">{incident.route ?? incident.url}</span>}
                          {incident.status === 'resolved' && incident.resolvedBy && (
                            <span className="truncate">Resolved by {incident.resolvedBy}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {incident.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => handleResolve(incident)}
                        disabled={isResolving}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                          isResolving
                            ? 'cursor-wait border-primary-200 bg-primary-50 text-primary-700'
                            : 'border-primary-200 bg-primary-50/70 text-primary-700 hover:bg-primary-50'
                        )}
                      >
                        <IconRotateCcw size={16} className={cn(isResolving && 'animate-spin')} />
                        {isResolving ? 'Resolving...' : 'Mark resolved'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(incident.copySummary, incident.id)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                        copyState?.target === incident.id && copyState.status === 'success'
                          ? 'border-primary-200 bg-primary-50 text-primary-700'
                          : copyState?.target === incident.id && copyState.status === 'error'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-white/40 bg-white/70 text-warm-700 hover:bg-white'
                      )}
                    >
                      {copyState?.target === incident.id && copyState.status === 'success' ? <IconCheck size={16} /> : <IconClipboard size={16} />}
                      {copyState?.target === incident.id && copyState.status === 'success'
                        ? 'Copied'
                        : copyState?.target === incident.id && copyState.status === 'error'
                          ? 'Copy failed'
                          : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-sm font-medium text-warm-700 transition-colors hover:bg-white"
                    >
                      {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                      {isExpanded ? 'Hide' : 'Detail'}
                    </button>
                  </div>
                </div>

                {resolveState?.target === incident.id && !isExpanded && (
                  <p
                    className={cn(
                      'mt-2 text-xs',
                      resolveState.status === 'success' ? 'text-primary-700' : 'text-red-700'
                    )}
                  >
                    {resolveState.message}
                  </p>
                )}

                {isExpanded && (
                  <div className="mt-3 space-y-3">
                    {incident.underlyingIncidents.length > 1 && (
                      <div className="rounded-xl border border-white/40 bg-white/65 p-3 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">
                          Group occurrences ({incident.underlyingIncidents.length} variants · signature {incident.signature})
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {incident.underlyingIncidents.slice(0, 5).map((underlying) => (
                            <li
                              key={underlying.id}
                              className="flex items-start justify-between gap-2 rounded-lg border border-white/40 bg-white/55 px-2.5 py-1.5 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-mono text-[11px] text-warm-700 truncate">
                                  {formatTimestamp(underlying.lastSeen)} · {timeAgo(underlying.lastSeen)}
                                  {' '}<span className="text-warm-500">({underlying.occurrences} hit{underlying.occurrences === 1 ? '' : 's'})</span>
                                </p>
                                <p className="mt-0.5 truncate text-warm-600">
                                  {underlying.message}
                                </p>
                              </div>
                              {underlying.status !== 'resolved' && (
                                <button
                                  type="button"
                                  onClick={() => handleResolve({
                                    ...underlying,
                                    underlyingIncidents: [underlying],
                                    groupOccurrences: underlying.occurrences,
                                    groupAffectedUsers: underlying.affectedUsers,
                                    signature: incident.signature,
                                  } as MergedIncident)}
                                  disabled={isPending}
                                  className="shrink-0 rounded-md border border-primary-200 bg-primary-50/70 px-2 py-1 text-[10px] font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
                                >
                                  Resolve
                                </button>
                              )}
                            </li>
                          ))}
                          {incident.underlyingIncidents.length > 5 && (
                            <li className="text-[11px] text-warm-500">
                              And {incident.underlyingIncidents.length - 5} more occurrences in this signature group.
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <NarrativePanel label="Diagnosis Basis" body={incident.diagnosisBasis} />
                      <NarrativePanel label="Likely Cause" body={incident.likelyCause} />
                      <NarrativePanel label="User Impact" body={incident.userImpact} />
                      <NarrativePanel label="Next Step" body={incident.nextStep} />
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                      <MetaItem label="First seen" value={`${formatTimestamp(incident.firstSeen)} (${timeAgo(incident.firstSeen)})`} />
                      <MetaItem label="Last seen" value={`${formatTimestamp(incident.lastSeen)} (${timeAgo(incident.lastSeen)})`} />
                      <MetaItem label="Resolved at" value={incident.resolvedAt ? `${formatTimestamp(incident.resolvedAt)} (${timeAgo(incident.resolvedAt)})` : null} />
                      <MetaItem label="Resolved by" value={incident.resolvedBy} mono />
                      <MetaItem label="Action" value={incident.action} mono />
                      <MetaItem label="Route" value={incident.route ?? incident.url} mono />
                      <MetaItem label="User" value={incident.userEmail ?? incident.userId} mono />
                      <MetaItem label="Request ID" value={incident.requestId} mono />
                      <MetaItem label="Round ID" value={incident.roundId} mono />
                      <MetaItem label="Player ID" value={incident.playerId} mono />
                      <MetaItem label="Error code" value={incident.errorCode} mono />
                      <MetaItem label="Trace source" value={incident.source} mono />
                    </div>

                    <div className="rounded-xl border border-white/40 bg-white/65 p-3 min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Raw message</p>
                      <p className="mt-1.5 break-all text-sm leading-6 text-warm-800">{incident.message}</p>
                    </div>

                    {(incident.errorHint || incident.errorDetails) && (
                      <div className="rounded-xl border border-amber-100 bg-amber-50/65 p-3 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Database guidance</p>
                        {incident.errorHint && (
                          <p className="mt-1.5 text-sm leading-6 text-amber-800 break-words">
                            <span className="font-medium">Hint:</span> {incident.errorHint}
                          </p>
                        )}
                        {incident.errorDetails && (
                          <p className="mt-1.5 text-sm leading-6 text-amber-800 break-words">
                            <span className="font-medium">Details:</span> {incident.errorDetails}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-white/40 bg-white/65 p-3 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Copy-ready brief</p>
                        <pre className="mt-2 max-h-[240px] overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all text-[11px] sm:text-xs leading-6 text-warm-700">
                          {incident.copySummary}
                        </pre>
                      </div>

                      <div className="rounded-xl border border-white/40 bg-white/65 p-3 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Stack trace</p>
                        {incident.stack ? (
                          <pre className="mt-2 max-h-[240px] overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all text-[11px] sm:text-xs leading-6 text-warm-700">
                            {incident.stack}
                          </pre>
                        ) : (
                          <p className="mt-2 text-sm text-warm-500">No stack trace was captured for this incident.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
