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
  Layers3,
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

function CompactStat({ label, value, detail, tone = 'default' }: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className={cn(
      'rounded-xl border px-3 py-2.5',
      tone === 'danger'
        ? 'border-red-100 bg-red-50/55'
        : 'border-white/35 bg-white/60'
    )}>
      <p className={cn(
        'text-[10px] font-semibold uppercase tracking-[0.16em]',
        tone === 'danger' ? 'text-red-500' : 'text-warm-400'
      )}>
        {label}
      </p>
      <div className="mt-1 flex items-end gap-2">
        <p className={cn(
          'text-lg font-semibold tabular-nums',
          tone === 'danger' ? 'text-red-700' : 'text-warm-900'
        )}>
          {value}
        </p>
        <p className={cn(
          'pb-0.5 text-xs',
          tone === 'danger' ? 'text-red-600' : 'text-warm-500'
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
    <div className="rounded-xl border border-white/40 bg-white/65 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">{label}</p>
      <p className={cn(
        'mt-1 break-words text-sm text-warm-800',
        mono && 'font-mono text-[12px]'
      )}>
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
    <div className="glass-standard rounded-2xl p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-red-50">
              <ShieldAlert size={17} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-warm-900">Incident Feed</h3>
              <p className="text-sm text-warm-500">Compact by default. Expand only the incident you want to inspect or copy.</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleCopy(visibleFeedSummary || 'No incidents in the current filter.', 'feed')}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
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

      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <CompactStat label="Raw Errors" value={totalErrors7d} detail="7d rows" />
        <CompactStat label="Incidents" value={recentErrors.length} detail="deduped" />
        <CompactStat label="Open" value={openCount} detail="unresolved" tone="danger" />
        <CompactStat label="Repeated" value={repeatedCount} detail={`${criticalErrors7d} critical, ${activeCount} active`} />
      </div>

      <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            { value: 'all', label: 'All', count: recentErrors.length },
            { value: 'open', label: 'Open', count: openCount },
            { value: 'recent', label: 'Open + 24h', count: openCount + activeCount },
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

        <p className="text-xs text-warm-500">Sorted by status, severity, then last seen.</p>
      </div>

      {visibleIncidents.length === 0 ? (
        <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-white/35 bg-white/55 px-6 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50">
            <Check size={20} className="text-primary-600" />
          </div>
          <p className="mt-3 text-sm font-semibold text-primary-700">
            {feedMode === 'open' ? 'No open incidents.' : feedMode === 'recent' ? 'No open or last-24h incidents.' : 'No incidents in the feed.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {visibleIncidents.map((incident) => {
            const severityStyle = getSeverityStyle(incident.severity);
            const statusStyle = statusStyles[incident.status];
            const isExpanded = expandedId === incident.id;

            return (
              <article
                key={incident.id}
                className={cn(
                  'rounded-2xl border bg-white/55 p-3.5 md:p-4',
                  severityStyle.border,
                  incident.status === 'open' && 'ring-1 ring-red-100'
                )}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
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
                        <Layers3 size={11} />
                        {incident.occurrences}
                      </span>
                      {incident.affectedUsers > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/65 px-2 py-0.5 text-[11px] font-medium text-warm-600">
                          <User size={11} />
                          {incident.affectedUsers}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-start gap-3">
                      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/80', severityStyle.icon)}>
                        <AlertTriangle size={16} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold leading-6 text-warm-900">{incident.title}</h4>
                        <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-warm-700">{incident.summary}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-500">
                          <span>{timeAgo(incident.lastSeen)} · {formatTimestamp(incident.lastSeen)}</span>
                          {incident.action && <span className="font-mono">{incident.action}</span>}
                          {(incident.route ?? incident.url) && <span className="truncate font-mono">{incident.route ?? incident.url}</span>}
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
                      <NarrativePanel label="Likely Cause" body={incident.likelyCause} />
                      <NarrativePanel label="User Impact" body={incident.userImpact} />
                      <NarrativePanel label="Next Step" body={incident.nextStep} />
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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

                    <div className="rounded-xl border border-white/40 bg-white/65 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Raw message</p>
                      <p className="mt-1.5 break-words text-sm leading-6 text-warm-800">{incident.message}</p>
                    </div>

                    {(incident.errorHint || incident.errorDetails) && (
                      <div className="rounded-xl border border-amber-100 bg-amber-50/65 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Database guidance</p>
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
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Stack trace</p>
                        {incident.stack ? (
                          <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-warm-700">
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
