'use client';

import { useState } from 'react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Clock3,
  Layers3,
  Route,
  ShieldAlert,
  User,
} from 'lucide-react';
import { timeAgo } from './admin-utils';

interface Props {
  errorLogs: AdminDashboardData['errorLogs'];
}

type FeedMode = 'all' | 'open' | 'recent';

const severityStyles: Record<string, {
  badge: string;
  border: string;
  card: string;
  icon: string;
}> = {
  critical: {
    badge: 'bg-red-100 text-red-700 border-red-200',
    border: 'border-red-200',
    card: 'bg-red-50/40',
    icon: 'text-red-600',
  },
  error: {
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    border: 'border-rose-200',
    card: 'bg-rose-50/40',
    icon: 'text-rose-600',
  },
  warning: {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    border: 'border-amber-200',
    card: 'bg-amber-50/40',
    icon: 'text-amber-600',
  },
  info: {
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    border: 'border-blue-200',
    card: 'bg-blue-50/40',
    icon: 'text-blue-600',
  },
};

const statusStyles: Record<AdminDashboardData['errorLogs']['recentErrors'][number]['status'], {
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
  historical: {
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    label: 'Historical',
  },
};

function getSeverityStyle(severity: string): (typeof severityStyles)['critical'] {
  return severityStyles[severity] ?? severityStyles.error!;
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

function MetaItem({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;

  return (
    <div className="rounded-xl border border-white/40 bg-white/65 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warm-400">{label}</p>
      <p className={cn(
        'mt-1 text-sm text-warm-800 break-words',
        mono && 'font-mono text-[12px]'
      )}>
        {value}
      </p>
    </div>
  );
}

function NarrativePanel({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/65 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">{label}</p>
      <p className="mt-2 text-sm leading-6 text-warm-700">{body}</p>
    </div>
  );
}

export function ErrorFeed({ errorLogs }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<FeedMode>('all');
  const [copyState, setCopyState] = useState<{ target: string; status: 'success' | 'error' } | null>(null);

  const { totalErrors7d, criticalErrors7d, recentErrors } = errorLogs;
  const openCount = recentErrors.filter((incident) => incident.status === 'open').length;
  const activeCount = recentErrors.filter((incident) => incident.status === 'active').length;
  const repeatedCount = recentErrors.filter((incident) => incident.occurrences > 1).length;

  const visibleIncidents = recentErrors.filter((incident) => {
    if (feedMode === 'open') return incident.status === 'open';
    if (feedMode === 'recent') return incident.status === 'open' || incident.status === 'active';
    return true;
  });

  const setCopyFeedback = (target: string, status: 'success' | 'error') => {
    setCopyState({ target, status });
    window.setTimeout(() => {
      setCopyState((current) => (current?.target === target ? null : current));
    }, 2200);
  };

  const handleCopy = async (text: string, target: string) => {
    try {
      await copyText(text);
      setCopyFeedback(target, 'success');
    } catch {
      setCopyFeedback(target, 'error');
    }
  };

  const visibleFeedSummary = visibleIncidents
    .map((incident, index) => `Incident ${index + 1}\n${incident.copySummary}`)
    .join('\n\n====================\n\n');

  return (
    <div className="glass-standard rounded-2xl p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50">
              <ShieldAlert size={18} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-warm-900">Incident Feed</h3>
              <p className="text-sm text-warm-500">
                Open incidents first, then recent active incidents, then older history.
              </p>
            </div>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-warm-600">
            Every card includes the likely cause, user impact, next step, raw message, IDs, and technical detail so you can copy one brief into chat and keep the context intact.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleCopy(visibleFeedSummary || 'No incidents in the current filter.', 'feed')}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
            copyState?.target === 'feed' && copyState.status === 'success'
              ? 'border-primary-200 bg-primary-50 text-primary-700'
              : copyState?.target === 'feed' && copyState.status === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-white/40 bg-white/70 text-warm-700 hover:bg-white'
          )}
        >
          {copyState?.target === 'feed' && copyState.status === 'success' ? <Check size={16} /> : <Clipboard size={16} />}
          {copyState?.target === 'feed' && copyState.status === 'success'
            ? 'Copied visible feed'
            : copyState?.target === 'feed' && copyState.status === 'error'
              ? 'Copy failed'
              : 'Copy visible feed'}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/35 bg-white/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">Raw Errors (7d)</p>
          <p className="mt-2 text-2xl font-semibold text-warm-900 tabular-nums">{totalErrors7d}</p>
          <p className="mt-1 text-xs text-warm-500">Every captured error_log row</p>
        </div>
        <div className="rounded-2xl border border-white/35 bg-white/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">Grouped Incidents</p>
          <p className="mt-2 text-2xl font-semibold text-warm-900 tabular-nums">{recentErrors.length}</p>
          <p className="mt-1 text-xs text-warm-500">Deduped by message, route, action, and code</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-500">Open Right Now</p>
          <p className="mt-2 text-2xl font-semibold text-red-700 tabular-nums">{openCount}</p>
          <p className="mt-1 text-xs text-red-600">Still unresolved in the admin incident stream</p>
        </div>
        <div className="rounded-2xl border border-white/35 bg-white/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">Repeated Patterns</p>
          <p className="mt-2 text-2xl font-semibold text-warm-900 tabular-nums">{repeatedCount}</p>
          <p className="mt-1 text-xs text-warm-500">{criticalErrors7d} critical raw errors and {activeCount} active incidents in the last 24h</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            { value: 'all', label: 'All incidents', count: recentErrors.length },
            { value: 'open', label: 'Open only', count: openCount },
            { value: 'recent', label: 'Open + last 24h', count: openCount + activeCount },
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

        <p className="text-sm text-warm-500">
          Sorted by status, then severity, then most recent last seen.
        </p>
      </div>

      {visibleIncidents.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-white/35 bg-white/55 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50">
            <Check size={24} className="text-primary-600" />
          </div>
          <p className="mt-4 text-sm font-semibold text-primary-700">
            {feedMode === 'open' ? 'No open incidents.' : feedMode === 'recent' ? 'No open or last-24h incidents.' : 'No incidents in the feed.'}
          </p>
          <p className="mt-1 text-xs text-warm-500">The filter is clear right now.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {visibleIncidents.map((incident) => {
            const severityStyle = getSeverityStyle(incident.severity);
            const statusStyle = statusStyles[incident.status];
            const isExpanded = expandedId === incident.id;
            const copyLabel =
              copyState?.target === incident.id && copyState.status === 'success'
                ? 'Copied incident'
                : copyState?.target === incident.id && copyState.status === 'error'
                  ? 'Copy failed'
                  : 'Copy incident';

            return (
              <article
                key={incident.id}
                className={cn(
                  'rounded-[24px] border p-4 md:p-5',
                  'shadow-[0_8px_24px_rgba(15,23,42,0.04)]',
                  severityStyle.border,
                  severityStyle.card,
                  incident.status === 'open' && 'ring-1 ring-red-100'
                )}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]', severityStyle.badge)}>
                        {incident.severity}
                      </span>
                      <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]', statusStyle.badge)}>
                        {statusStyle.label}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-white/40 bg-white/65 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-warm-600">
                        {incident.featureArea}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/65 px-2.5 py-1 text-xs font-medium text-warm-600">
                        <Layers3 size={12} />
                        {incident.occurrences} hit{incident.occurrences === 1 ? '' : 's'}
                      </span>
                      {incident.affectedUsers > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/65 px-2.5 py-1 text-xs font-medium text-warm-600">
                          <User size={12} />
                          {incident.affectedUsers} user{incident.affectedUsers === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-start gap-3">
                      <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/80', severityStyle.icon)}>
                        <AlertTriangle size={18} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-lg font-semibold leading-7 text-warm-900">{incident.title}</h4>
                        <p className="mt-1 text-sm leading-6 text-warm-700">{incident.summary}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <div className="rounded-2xl border border-white/40 bg-white/70 px-3 py-2 text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warm-400">Last seen</p>
                      <p className="mt-1 text-sm font-medium text-warm-800">{timeAgo(incident.lastSeen)}</p>
                      <p className="text-xs text-warm-500">{formatTimestamp(incident.lastSeen)}</p>
                    </div>
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
                      {copyLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-sm font-medium text-warm-700 transition-colors hover:bg-white"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {isExpanded ? 'Hide technical detail' : 'Show technical detail'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <NarrativePanel label="Likely Cause" body={incident.likelyCause} />
                  <NarrativePanel label="User Impact" body={incident.userImpact} />
                  <NarrativePanel label="Next Step" body={incident.nextStep} />
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <MetaItem label="First seen" value={`${formatTimestamp(incident.firstSeen)} (${timeAgo(incident.firstSeen)})`} />
                  <MetaItem label="Last seen" value={`${formatTimestamp(incident.lastSeen)} (${timeAgo(incident.lastSeen)})`} />
                  <MetaItem label="Action" value={incident.action} mono />
                  <MetaItem label="Route" value={incident.route ?? incident.url} mono />
                  <MetaItem label="User" value={incident.userEmail ?? incident.userId} mono />
                  <MetaItem label="Request ID" value={incident.requestId} mono />
                  <MetaItem label="Round ID" value={incident.roundId} mono />
                  <MetaItem label="Player ID" value={incident.playerId} mono />
                  <MetaItem label="Error code" value={incident.errorCode} mono />
                  <MetaItem label="Trace source" value={incident.source} mono />
                </div>

                <div className="mt-4 rounded-2xl border border-white/40 bg-white/65 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">Raw message</p>
                  <p className="mt-2 break-words text-sm leading-6 text-warm-800">{incident.message}</p>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-3">
                    {(incident.errorHint || incident.errorDetails) && (
                      <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3.5">
                        <div className="flex items-start gap-2">
                          <Clock3 size={16} className="mt-0.5 text-amber-600" />
                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-amber-700">Database or runtime guidance</p>
                            {incident.errorHint && (
                              <p className="text-sm leading-6 text-amber-800">
                                <span className="font-medium">Hint:</span> {incident.errorHint}
                              </p>
                            )}
                            {incident.errorDetails && (
                              <p className="text-sm leading-6 text-amber-800">
                                <span className="font-medium">Details:</span> {incident.errorDetails}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border border-white/40 bg-white/65 p-3.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">Copy-ready brief</p>
                        <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-warm-700">
                          {incident.copySummary}
                        </pre>
                      </div>

                      <div className="rounded-2xl border border-white/40 bg-white/65 p-3.5">
                        <div className="flex items-center gap-2">
                          <Route size={14} className="text-warm-500" />
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">Stack trace</p>
                        </div>
                        {incident.stack ? (
                          <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-warm-700">
                            {incident.stack}
                          </pre>
                        ) : (
                          <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-white/40 bg-white/45 px-3 py-3 text-sm text-warm-500">
                            <AlertTriangle size={14} />
                            No stack trace was captured for this incident.
                          </div>
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
