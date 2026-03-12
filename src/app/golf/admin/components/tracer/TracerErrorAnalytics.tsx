'use client';

import { useMemo, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { resolveDashboardIncident } from '@/app/golf/actions/admin-data';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Layers3,
  Route,
  RotateCcw,
  ShieldAlert,
  User,
} from 'lucide-react';
import { AdminAreaChart, AdminDonutChart, AdminProgressBar } from '../AdminChart';
import { timeAgo } from '../admin-utils';
import type { ErrorGroup, AffectedPlayer, DailyCount, TracerIncident } from './tracer-types';

interface TracerErrorAnalyticsProps {
  errorGroups: ErrorGroup[];
  affectedPlayers: AffectedPlayer[];
  dailyErrorCounts: DailyCount[];
  recentErrors: TracerIncident[];
  totalErrors7d: number;
  criticalErrors7d: number;
  onIncidentResolved: () => Promise<void>;
}

type TimeRange = '7d' | '14d' | '30d';
type FeedMode = 'all' | 'critical' | 'recent';
type QueueTab = 'active' | 'resolved';

const GLASS_CARD = cn(
  'bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl',
  'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]'
);

const TIME_RANGES: { label: TimeRange; days: number }[] = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
];

const severityStyles: Record<TracerIncident['severity'], {
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

const severityDonutColors: Record<TracerIncident['severity'], string> = {
  critical: '#EF4444',
  error: '#F87171',
  warning: '#F59E0B',
  info: '#3B82F6',
};

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function filterByDays(data: DailyCount[], days: number): DailyCount[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return data.filter((entry) => new Date(entry.date) >= cutoff);
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

function MetaItem({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;

  return (
    <div className="rounded-xl border border-white/40 bg-white/65 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">{label}</p>
      <p className={cn('mt-1 break-words text-sm text-warm-800', mono && 'font-mono text-[12px]')}>
        {value}
      </p>
    </div>
  );
}

function NarrativePanel({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/40 bg-white/65 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">{label}</p>
      <p className="mt-1.5 text-sm leading-6 text-warm-700">{body}</p>
    </div>
  );
}

export default function TracerErrorAnalytics({
  errorGroups,
  affectedPlayers,
  dailyErrorCounts,
  recentErrors,
  totalErrors7d,
  criticalErrors7d,
  onIncidentResolved,
}: TracerErrorAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [queueTab, setQueueTab] = useState<QueueTab>('active');
  const [feedMode, setFeedMode] = useState<FeedMode>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<{ target: string; status: 'success' | 'error' } | null>(null);
  const [resolveState, setResolveState] = useState<{ target: string; status: 'success' | 'error'; message: string } | null>(null);
  const [pendingIncidentId, setPendingIncidentId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeIncidents = useMemo(
    () => recentErrors.filter((incident) => incident.status === 'open'),
    [recentErrors]
  );
  const resolvedIncidents = useMemo(
    () => [...recentErrors]
      .filter((incident) => incident.status === 'resolved')
      .sort((a, b) => new Date(b.resolvedAt ?? b.lastSeen).getTime() - new Date(a.resolvedAt ?? a.lastSeen).getTime()),
    [recentErrors]
  );

  const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const currentQueueIncidents = queueTab === 'resolved' ? resolvedIncidents : activeIncidents;
  const recentIncidentCount = useMemo(
    () => currentQueueIncidents.filter((incident) => {
      const referenceTime = queueTab === 'resolved' ? (incident.resolvedAt ?? incident.lastSeen) : incident.lastSeen;
      return new Date(referenceTime).getTime() >= recentCutoff;
    }).length,
    [currentQueueIncidents, queueTab, recentCutoff]
  );

  const visibleIncidents = useMemo(() => {
    const source = currentQueueIncidents;

    return source.filter((incident) => {
      if (feedMode === 'critical') return incident.severity === 'critical' || incident.severity === 'error';
      if (feedMode === 'recent') {
        const referenceTime = queueTab === 'resolved' ? (incident.resolvedAt ?? incident.lastSeen) : incident.lastSeen;
        return new Date(referenceTime).getTime() >= recentCutoff;
      }
      return true;
    });
  }, [currentQueueIncidents, feedMode, queueTab, recentCutoff]);

  const filteredDailyData = useMemo(() => {
    const rangeCfg = TIME_RANGES.find((entry) => entry.label === timeRange);
    return filterByDays(dailyErrorCounts, rangeCfg?.days ?? 7);
  }, [dailyErrorCounts, timeRange]);

  const trendChartData = useMemo(
    () => filteredDailyData.map((entry) => ({ label: formatDateLabel(entry.date), value: entry.count })),
    [filteredDailyData]
  );

  const severityDistribution = useMemo(() => {
    const counts: Record<TracerIncident['severity'], number> = {
      critical: 0,
      error: 0,
      warning: 0,
      info: 0,
    };

    for (const incident of recentErrors) {
      counts[incident.severity] += incident.occurrences;
    }

    return (Object.keys(counts) as TracerIncident['severity'][]).filter((severity) => counts[severity] > 0).map((severity) => ({
      label: severity.charAt(0).toUpperCase() + severity.slice(1),
      value: counts[severity],
      color: severityDonutColors[severity],
    }));
  }, [recentErrors]);

  const topPlayers = useMemo(() => affectedPlayers.slice(0, 5), [affectedPlayers]);
  const maxPlayerErrors = topPlayers.length > 0 ? topPlayers[0]!.errorCount : 1;

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

  const handleResolve = (incident: TracerIncident) => {
    setPendingIncidentId(incident.id);
    startTransition(async () => {
      try {
        const result = await resolveDashboardIncident({
          incidentKey: incident.id,
          title: incident.title,
          message: incident.sampleMessage,
          severity: incident.severity,
          route: incident.route,
          url: incident.url,
          action: incident.action,
          featureArea: incident.featureArea.toLowerCase().replace(/\s+/g, '_'),
          errorCode: incident.errorCode,
          source: incident.source,
        });
        setResolveFeedback(incident.id, result.success ? 'success' : 'error', result.message);
        if (result.success) {
          await onIncidentResolved();
          setExpandedId((current) => (current === incident.id ? null : current));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not resolve tracer incident.';
        setResolveFeedback(incident.id, 'error', message);
      } finally {
        setPendingIncidentId((current) => (current === incident.id ? null : current));
      }
    });
  };

  const visibleFeedSummary = visibleIncidents
    .map((incident, index) => `${queueTab === 'resolved' ? 'Resolved' : 'Active'} tracer incident ${index + 1}\n${incident.copySummary}`)
    .join('\n\n====================\n\n');

  return (
    <div className="space-y-5">
      <div className={cn(GLASS_CARD, 'p-4 md:p-5')}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-red-50">
                <ShieldAlert size={17} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-warm-900">Tracer Incident Feed</h3>
                <p className="text-sm text-warm-500">Shot-tracking-only incidents with explicit cause, fix guidance, copy support, and operator resolution.</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleCopy(visibleFeedSummary || 'No tracer incidents in the current view.', 'feed')}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
              copyState?.target === 'feed' && copyState.status === 'success'
                ? 'border-primary-200 bg-primary-50 text-primary-700'
                : copyState?.target === 'feed' && copyState.status === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-white/40 bg-white/70 text-warm-700 hover:bg-white'
            )}
          >
            {copyState?.target === 'feed' && copyState.status === 'success' ? <Check size={16} /> : <Clipboard size={16} />}
            {copyState?.target === 'feed' && copyState.status === 'success'
              ? 'Copied tracer feed'
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

        <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-5">
          <MetaItem label="Raw traces" value={String(totalErrors7d)} />
          <MetaItem label="Active incidents" value={String(activeIncidents.length)} />
          <MetaItem label="Resolved incidents" value={String(resolvedIncidents.length)} />
          <MetaItem label="Critical traces" value={String(criticalErrors7d)} />
          <MetaItem label="Pattern groups" value={String(errorGroups.length)} />
        </div>

        <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {([
              { value: 'active', label: 'Active', count: activeIncidents.length },
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

          <div className="flex flex-wrap gap-2">
            {([
              { value: 'all', label: 'All', count: queueTab === 'resolved' ? resolvedIncidents.length : activeIncidents.length },
              { value: 'critical', label: 'Critical + error', count: (queueTab === 'resolved' ? resolvedIncidents : activeIncidents).filter((incident) => incident.severity === 'critical' || incident.severity === 'error').length },
              { value: 'recent', label: 'Last 24h', count: recentIncidentCount },
            ] as { value: FeedMode; label: string; count: number }[]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFeedMode(option.value)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                  feedMode === option.value
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
        </div>

        {visibleIncidents.length === 0 ? (
          <div className="mt-5 flex items-center justify-center rounded-2xl border border-white/35 bg-white/55 px-6 py-10 text-sm text-warm-500">
            No tracer incidents match this filter.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {visibleIncidents.map((incident) => {
              const style = severityStyles[incident.severity];
              const isExpanded = expandedId === incident.id;
              const resolvePending = pendingIncidentId === incident.id && isPending;

              return (
                <article
                  key={incident.id}
                  className={cn(
                    'rounded-2xl border bg-white/55 p-3.5 md:p-4',
                    style.border,
                    incident.status === 'open' && 'ring-1 ring-red-100'
                  )}
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', style.badge)}>
                          {incident.severity}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-white/40 bg-white/65 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warm-600">
                          {incident.featureArea}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/65 px-2 py-0.5 text-[11px] font-medium text-warm-600">
                          <Layers3 size={11} />
                          {incident.occurrences}
                        </span>
                        {incident.playerIds.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/65 px-2 py-0.5 text-[11px] font-medium text-warm-600">
                            <User size={11} />
                            {incident.playerIds.length}
                          </span>
                        )}
                        {incident.roundIds.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/65 px-2 py-0.5 text-[11px] font-medium text-warm-600">
                            <Route size={11} />
                            {incident.roundIds.length} rounds
                          </span>
                        )}
                        <span className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
                          incident.status === 'open'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-primary-200 bg-primary-50 text-primary-700'
                        )}>
                          {incident.status === 'open' ? 'Open' : 'Resolved'}
                        </span>
                      </div>

                      <div className="mt-2 flex items-start gap-3">
                        <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/80', style.icon)}>
                          {incident.status === 'resolved' ? <RotateCcw size={16} /> : <AlertTriangle size={16} />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold leading-6 text-warm-900">{incident.title}</h4>
                          <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-warm-700">{incident.summary}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-500">
                            <span>{timeAgo(incident.lastSeen)} · {formatTimestamp(incident.lastSeen)}</span>
                            {incident.action && <span className="font-mono">{incident.action}</span>}
                            {(incident.route ?? incident.url) && <span className="truncate font-mono">{incident.route ?? incident.url}</span>}
                            {incident.resolvedAt && <span>Resolved {timeAgo(incident.resolvedAt)}</span>}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
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
                        {copyState?.target === incident.id && copyState.status === 'success' ? <Check size={16} /> : <Clipboard size={16} />}
                        {copyState?.target === incident.id && copyState.status === 'success'
                          ? 'Copied'
                          : copyState?.target === incident.id && copyState.status === 'error'
                            ? 'Copy failed'
                            : 'Copy'}
                      </button>

                      {incident.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => handleResolve(incident)}
                          disabled={resolvePending}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                            'border-primary-200 bg-primary-50/80 text-primary-700 hover:bg-primary-50',
                            resolvePending && 'cursor-not-allowed opacity-60'
                          )}
                        >
                          <RotateCcw size={16} />
                          {resolvePending ? 'Resolving...' : 'Mark resolved'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-sm font-medium text-warm-700 transition-colors hover:bg-white"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        {isExpanded ? 'Hide detail' : 'Show detail'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-3 lg:grid-cols-3">
                        <NarrativePanel label="Why It Happened" body={incident.whyItHappened} />
                        <NarrativePanel label="How To Fix" body={incident.howToFix} />
                        <NarrativePanel label="Operator Impact" body={incident.operatorImpact} />
                      </div>

                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <MetaItem label="First seen" value={`${formatTimestamp(incident.firstSeen)} (${timeAgo(incident.firstSeen)})`} />
                        <MetaItem label="Last seen" value={`${formatTimestamp(incident.lastSeen)} (${timeAgo(incident.lastSeen)})`} />
                        <MetaItem label="Action" value={incident.action} mono />
                        <MetaItem label="Route" value={incident.route ?? incident.url} mono />
                        <MetaItem label="Request ID" value={incident.requestId} mono />
                        <MetaItem label="Error code" value={incident.errorCode} mono />
                        <MetaItem label="Round IDs" value={incident.roundIds.join(', ') || null} mono />
                        <MetaItem label="Player IDs" value={incident.playerIds.join(', ') || null} mono />
                        <MetaItem label="User emails" value={incident.userEmails.join(', ') || null} mono />
                        <MetaItem label="Trace source" value={incident.source} mono />
                        <MetaItem label="Resolution" value={incident.resolvedAt ? `${formatTimestamp(incident.resolvedAt)}${incident.resolvedBy ? ` · ${incident.resolvedBy}` : ''}` : null} />
                      </div>

                      <div className="rounded-xl border border-white/40 bg-white/65 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Raw message</p>
                        <p className="mt-1.5 break-words text-sm leading-6 text-warm-800">{incident.sampleMessage}</p>
                      </div>

                      {(incident.errorHint || incident.errorDetails) && (
                        <div className="rounded-xl border border-amber-100 bg-amber-50/65 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Runtime guidance</p>
                          {incident.errorHint && (
                            <p className="mt-1.5 text-sm leading-6 text-amber-800">
                              <span className="font-medium">Hint:</span> {incident.errorHint}
                            </p>
                          )}
                          {incident.errorDetails && (
                            <p className="mt-1.5 text-sm leading-6 text-amber-800">
                              <span className="font-medium">Details:</span> {incident.errorDetails}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-white/40 bg-white/65 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Copy-ready brief</p>
                          <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-warm-700">
                            {incident.copySummary}
                          </pre>
                        </div>

                        <div className="rounded-xl border border-white/40 bg-white/65 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Context and stack</p>
                          <div className="mt-2 space-y-3">
                            {incident.sampleContext ? (
                              <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-warm-700">
                                {JSON.stringify(incident.sampleContext, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-sm text-warm-500">No structured context captured.</p>
                            )}
                            {incident.sampleStack && (
                              <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-warm-700">
                                {incident.sampleStack}
                              </pre>
                            )}
                          </div>
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <div className={cn(GLASS_CARD, 'p-5')}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-warm-900">Error Trend</h3>
            <div className="flex items-center gap-1 rounded-lg bg-warm-100/50 p-0.5">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.label}
                  type="button"
                  onClick={() => setTimeRange(range.label)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                    timeRange === range.label
                      ? 'bg-white text-warm-900 shadow-sm'
                      : 'text-warm-500 hover:text-warm-700'
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          <AdminAreaChart
            data={trendChartData}
            title="Error Trend"
            color="#EF4444"
            height={220}
          />
        </div>

        <div className="space-y-5">
          <div className={cn(GLASS_CARD, 'p-5')}>
            <AdminDonutChart
              data={severityDistribution}
              title="Severity Mix"
              size={150}
            />
          </div>

          <div className={cn(GLASS_CARD, 'p-5')}>
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-warm-900">Most Affected Players</h4>
              <span className="text-xs text-warm-500">{errorGroups.length} normalized patterns</span>
            </div>

            {topPlayers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warm-100/80">
                  <AlertTriangle size={18} className="text-warm-400" />
                </div>
                <p className="mt-3 text-sm font-medium text-warm-600">No affected players</p>
                <p className="text-xs text-warm-400">No player-linked tracer incidents in the current slice.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topPlayers.map((player) => (
                  <AdminProgressBar
                    key={player.player_id}
                    label={player.player_name}
                    value={player.errorCount}
                    max={maxPlayerErrors}
                    color="#EF4444"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
