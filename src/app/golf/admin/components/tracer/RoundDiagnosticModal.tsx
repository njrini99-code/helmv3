'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import {
  IconCheck,
  IconCheckCircle2,
  IconClipboard,
  IconLoader,
  IconShieldAlert,
  IconTarget,
  IconXCircle,
} from '@/components/icons';
import { IconRotateCcw as RotateCcw, IconHash as Hash } from '@/components/icons';
import { resolveDashboardIncident } from '@/app/golf/actions/admin-data';
import { DetailModal } from '../DetailModal';
import { timeAgo } from '../admin-utils';
import { Button } from '@/components/ui/button';
import {
  getTracerRoundDiagnostic,
  type TracerRoundDiagnosticData,
  type TracerHoleDiagnostic,
  type TracerIncident,
  type TracerShotDiagnostic,
} from '@/app/golf/actions/admin-tracer-data';

// ============================================================================
// TYPES
// ============================================================================

interface RoundDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  roundId: string | null;
  onIncidentResolved: () => Promise<void>;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RoundDiagnosticModal({ isOpen, onClose, roundId, onIncidentResolved }: RoundDiagnosticModalProps) {
  const [data, setData] = useState<TracerRoundDiagnosticData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDiagnostic = useCallback(async (targetRoundId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTracerRoundDiagnostic(targetRoundId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diagnostic data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !roundId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getTracerRoundDiagnostic(roundId);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load diagnostic data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, loadDiagnostic, roundId]);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Round Diagnostic"
      subtitle={data ? `${data.playerName} \u2014 ${roundId?.slice(0, 8)}...` : roundId ? `${roundId.slice(0, 8)}...` : undefined}
      showTimeRange={false}
      width="full"
    >
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <IconLoader size={28} className="text-primary-500 animate-spin mb-3" />
          <p className="text-sm text-warm-500">Loading diagnostic data...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50/80 border border-red-200 rounded-xl p-6 text-center">
          <IconXCircle className="mx-auto mb-2 text-red-400" size={24} />
          <p className="text-warm-900 font-semibold text-sm">Failed to load</p>
          <p className="text-warm-500 text-xs mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Hole-by-hole Grid */}
          <HoleGrid holes={data.holes} />

          {/* Shot Summary */}
          <ShotSummary shots={data.shots} />

          {/* Errors */}
          <ErrorsList
            errors={data.errors}
            onResolve={async () => {
              await onIncidentResolved();
              if (roundId) {
                await loadDiagnostic(roundId);
              }
            }}
          />

          {/* Data Completeness */}
          <CompletenessChecklist holes={data.holes} shots={data.shots} />
        </div>
      )}
    </DetailModal>
  );
}

// ============================================================================
// HOLE-BY-HOLE GRID
// ============================================================================

function HoleGrid({ holes }: { holes: TracerHoleDiagnostic[] }) {
  if (holes.length === 0) {
    return (
      <section>
        <SectionLabel label="Hole-by-Hole" />
        <div className="bg-warm-50/50 rounded-xl p-6 text-center">
          <Hash size={20} className="mx-auto mb-2 text-warm-300" />
          <p className="text-sm text-warm-400">No hole data recorded</p>
        </div>
      </section>
    );
  }

  const maxHole = Math.max(...holes.map((h) => h.hole_number));
  const is9Hole = maxHole <= 9;
  const holeSlots = Array.from({ length: is9Hole ? 9 : 18 }, (_, i) => i + 1);
  const holeMap = new Map(holes.map((h) => [h.hole_number, h]));

  return (
    <section>
      <SectionLabel label="Hole-by-Hole" />
      <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-clip">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-warm-100/80">
                <th className="px-3 py-2.5 text-left text-eyebrow font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10 min-w-[60px]">
                  Hole
                </th>
                {holeSlots.map((n) => (
                  <th key={n} className="px-2 py-2.5 text-center font-semibold text-warm-600 min-w-[44px]">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Par row */}
              <tr className="border-b border-warm-50/80">
                <td className="px-3 py-2 text-eyebrow font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10">
                  Par
                </td>
                {holeSlots.map((n) => {
                  const hole = holeMap.get(n);
                  return (
                    <td key={n} className="px-2 py-2 text-center tabular-nums text-warm-500">
                      {hole?.par ?? <span className="text-warm-200">&mdash;</span>}
                    </td>
                  );
                })}
              </tr>

              {/* Score row */}
              <tr className="border-b border-warm-50/80">
                <td className="px-3 py-2 text-eyebrow font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10">
                  Score
                </td>
                {holeSlots.map((n) => {
                  const hole = holeMap.get(n);
                  const score = hole?.score;
                  const par = hole?.par;
                  let colorClass = 'text-warm-600';
                  let bgClass = '';
                  if (score != null && par != null) {
                    if (score < par) { colorClass = 'text-green-700 font-bold'; bgClass = 'bg-green-50/60'; }
                    else if (score > par) { colorClass = 'text-red-600 font-bold'; bgClass = 'bg-red-50/60'; }
                    else { colorClass = 'text-warm-600'; bgClass = 'bg-warm-50/40'; }
                  }
                  return (
                    <td key={n} className={cn('px-2 py-2 text-center tabular-nums', bgClass, colorClass)}>
                      {score ?? <span className="text-warm-200">&mdash;</span>}
                    </td>
                  );
                })}
              </tr>

              {/* Putts row */}
              <tr className="border-b border-warm-50/80">
                <td className="px-3 py-2 text-eyebrow font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10">
                  Putts
                </td>
                {holeSlots.map((n) => {
                  const hole = holeMap.get(n);
                  return (
                    <td key={n} className="px-2 py-2 text-center tabular-nums text-warm-500">
                      {hole?.putts ?? <span className="text-warm-200">&mdash;</span>}
                    </td>
                  );
                })}
              </tr>

              {/* FW row */}
              <tr className="border-b border-warm-50/80">
                <td className="px-3 py-2 text-eyebrow font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10">
                  FW
                </td>
                {holeSlots.map((n) => {
                  const hole = holeMap.get(n);
                  return (
                    <td key={n} className="px-2 py-2 text-center">
                      {hole?.fairway_hit === true ? (
                        <IconCheckCircle2 size={13} className="inline text-green-500" />
                      ) : hole?.fairway_hit === false ? (
                        <IconXCircle size={13} className="inline text-red-400" />
                      ) : (
                        <span className="text-warm-200">&mdash;</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* GIR row */}
              <tr>
                <td className="px-3 py-2 text-eyebrow font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10">
                  GIR
                </td>
                {holeSlots.map((n) => {
                  const hole = holeMap.get(n);
                  return (
                    <td key={n} className="px-2 py-2 text-center">
                      {hole?.gir === true ? (
                        <IconCheckCircle2 size={13} className="inline text-green-500" />
                      ) : hole?.gir === false ? (
                        <IconXCircle size={13} className="inline text-red-400" />
                      ) : (
                        <span className="text-warm-200">&mdash;</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// SHOT SUMMARY
// ============================================================================

function ShotSummary({ shots }: { shots: TracerShotDiagnostic[] }) {
  if (shots.length === 0) {
    return (
      <section>
        <SectionLabel label="Shot Summary" />
        <div className="bg-warm-50/50 rounded-xl p-6 text-center">
          <IconTarget size={20} className="mx-auto mb-2 text-warm-300" />
          <p className="text-sm text-warm-400">No shot data recorded</p>
        </div>
      </section>
    );
  }

  // Group by shot_type
  const byType = new Map<string, number>();
  for (const shot of shots) {
    const key = shot.shot_type || 'unknown';
    byType.set(key, (byType.get(key) || 0) + 1);
  }
  const typeBreakdown = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <section>
      <SectionLabel label="Shot Summary" />
      <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-warm-900 tabular-nums">{shots.length}</span>
            <span className="text-sm text-warm-500">total shots</span>
          </div>
        </div>
        {typeBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {typeBreakdown.map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warm-50/60 text-xs font-medium text-warm-600"
              >
                <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                <span className="text-warm-400 tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// ERRORS LIST
// ============================================================================

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
    <div className="rounded-xl border border-white/40 bg-white/65 px-3 py-2">
      <p className="text-eyebrow font-semibold uppercase tracking-[0.16em] text-warm-400">{label}</p>
      <p className={cn('mt-1 break-words text-sm text-warm-800', mono && 'font-mono text-caption')}>
        {value}
      </p>
    </div>
  );
}

function NarrativePanel({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/40 bg-white/65 p-3">
      <p className="text-eyebrow font-semibold uppercase tracking-[0.16em] text-warm-400">{label}</p>
      <p className="mt-1.5 text-sm leading-6 text-warm-700">{body}</p>
    </div>
  );
}

function ErrorsList({
  errors,
  onResolve,
}: {
  errors: TracerIncident[];
  onResolve: () => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<{ target: string; status: 'success' | 'error' } | null>(null);
  const [resolveState, setResolveState] = useState<{ target: string; status: 'success' | 'error'; message: string } | null>(null);
  const [pendingIncidentId, setPendingIncidentId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (errors.length === 0) {
    return (
      <section>
        <SectionLabel label="Tracer Errors" />
        <div className="bg-green-50/40 border border-green-200/30 rounded-xl p-5 text-center">
          <IconCheckCircle2 size={20} className="mx-auto mb-2 text-green-500" />
          <p className="text-sm text-green-700 font-medium">No shot-tracking incidents tied to this round</p>
        </div>
      </section>
    );
  }

  const severityStyles: Record<TracerIncident['severity'], {
    badge: string;
    border: string;
    icon: string;
  }> = {
    critical: {
      badge: 'bg-red-100 text-red-800',
      border: 'border-red-200',
      icon: 'text-red-600',
    },
    error: {
      badge: 'bg-red-50 text-red-700',
      border: 'border-rose-200',
      icon: 'text-rose-600',
    },
    warning: {
      badge: 'bg-amber-50 text-amber-700',
      border: 'border-amber-200',
      icon: 'text-amber-600',
    },
    info: {
      badge: 'bg-blue-50 text-blue-700',
      border: 'border-blue-200',
      icon: 'text-blue-600',
    },
  };

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
          eventIds: incident.eventIds,
        });
        setResolveFeedback(incident.id, result.success ? 'success' : 'error', result.message);
        if (result.success) {
          await onResolve();
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

  return (
    <section>
      <SectionLabel label={`Tracer Errors (${errors.length})`} />
      {resolveState && (
        <div
          className={cn(
            'mb-3 rounded-xl border px-3 py-2 text-sm',
            resolveState.status === 'success'
              ? 'border-primary-100 bg-primary-50/70 text-primary-700'
              : 'border-red-100 bg-red-50/70 text-red-700'
          )}
        >
          {resolveState.message}
        </div>
      )}
      <div className="space-y-3">
        {errors.map((incident) => {
          const style = severityStyles[incident.severity];
          const isExpanded = expandedId === incident.id;
          const resolvePending = pendingIncidentId === incident.id && isPending;
          return (
            <article
              key={incident.id}
              className={cn(
                'bg-white/65 backdrop-blur-[16px] border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] p-4',
                style.border
              )}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded text-eyebrow font-bold uppercase tracking-wide', style.badge)}>
                      {incident.severity}
                    </span>
                    <span className={cn(
                      'inline-flex px-1.5 py-0.5 rounded text-eyebrow font-bold uppercase tracking-wide',
                      incident.status === 'open'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-primary-50 text-primary-700'
                    )}>
                      {incident.status === 'open' ? 'Open' : 'Resolved'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/65 px-2 py-0.5 text-eyebrow font-medium text-warm-600">
                      <IconShieldAlert size={11} />
                      {incident.occurrences}
                    </span>
                  </div>
                  <h4 className="mt-2 text-sm font-semibold text-warm-900">{incident.title}</h4>
                  <p className="mt-1 text-sm leading-6 text-warm-700">{incident.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-warm-500">
                    <span>{timeAgo(incident.lastSeen)} · {formatTimestamp(incident.lastSeen)}</span>
                    {incident.action && <span className="font-mono">{incident.action}</span>}
                    {incident.route && <span className="font-mono">{incident.route}</span>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="danger"
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
                  </Button>

                  {incident.status === 'open' && (
                    <Button variant="primary"
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
                    </Button>
                  )}

                  <Button variant="ghost"
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-sm font-medium text-warm-700 transition-colors hover:bg-white"
                  >
                    {isExpanded ? 'Hide detail' : 'Show detail'}
                  </Button>
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
                    <MetaItem label="Round IDs" value={incident.roundIds.join(', ') || null} mono />
                    <MetaItem label="Player IDs" value={incident.playerIds.join(', ') || null} mono />
                    <MetaItem label="Request ID" value={incident.requestId} mono />
                    <MetaItem label="Error code" value={incident.errorCode} mono />
                    <MetaItem label="Trace source" value={incident.source} mono />
                    <MetaItem label="Resolution" value={incident.resolvedAt ? `${formatTimestamp(incident.resolvedAt)}${incident.resolvedBy ? ` · ${incident.resolvedBy}` : ''}` : null} />
                  </div>

                  <div className="rounded-xl border border-white/40 bg-white/65 p-3">
                    <p className="text-eyebrow font-semibold uppercase tracking-[0.16em] text-warm-400">Raw message</p>
                    <p className="mt-1.5 break-words text-sm leading-6 text-warm-800">{incident.sampleMessage}</p>
                  </div>

                  {(incident.errorHint || incident.errorDetails) && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50/65 p-3">
                      <p className="text-eyebrow font-semibold uppercase tracking-[0.16em] text-amber-600">Runtime guidance</p>
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
                      <p className="text-eyebrow font-semibold uppercase tracking-[0.16em] text-warm-400">Copy-ready brief</p>
                      <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-warm-700">
                        {incident.copySummary}
                      </pre>
                    </div>

                    <div className="rounded-xl border border-white/40 bg-white/65 p-3">
                      <p className="text-eyebrow font-semibold uppercase tracking-[0.16em] text-warm-400">Context and stack</p>
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
    </section>
  );
}

// ============================================================================
// COMPLETENESS CHECKLIST
// ============================================================================

function CompletenessChecklist({
  holes,
  shots,
}: {
  holes: TracerHoleDiagnostic[];
  shots: TracerShotDiagnostic[];
}) {
  const hasHoles = holes.length > 0;
  const hasShots = shots.length > 0;
  const hasScores = holes.some((h) => h.score != null);
  const hasPutts = holes.some((h) => h.putts != null);
  const hasFairways = holes.some((h) => h.fairway_hit != null);
  const hasGIR = holes.some((h) => h.gir != null);
  const hasPar = holes.some((h) => h.par != null);
  const hasShotTypes = shots.some((s) => s.shot_type != null);
  const hasClubs = shots.some((s) => s.club != null);
  const hasDistances = shots.some((s) => s.distance != null);

  const checks = [
    { label: 'Holes Recorded', ok: hasHoles, detail: hasHoles ? `${holes.length} holes` : 'None' },
    { label: 'Shots Recorded', ok: hasShots, detail: hasShots ? `${shots.length} shots` : 'None' },
    { label: 'Par Data', ok: hasPar, detail: hasPar ? 'Present' : 'Missing' },
    { label: 'Scores', ok: hasScores, detail: hasScores ? 'Present' : 'Missing' },
    { label: 'Putts', ok: hasPutts, detail: hasPutts ? 'Present' : 'Missing' },
    { label: 'Fairways', ok: hasFairways, detail: hasFairways ? 'Present' : 'Missing' },
    { label: 'GIR', ok: hasGIR, detail: hasGIR ? 'Present' : 'Missing' },
    { label: 'Shot Types', ok: hasShotTypes, detail: hasShotTypes ? 'Present' : 'Missing' },
    { label: 'Clubs', ok: hasClubs, detail: hasClubs ? 'Present' : 'Missing' },
    { label: 'Distances', ok: hasDistances, detail: hasDistances ? 'Present' : 'Missing' },
  ];

  const passCount = checks.filter((c) => c.ok).length;

  return (
    <section>
      <SectionLabel label={`Data Completeness (${passCount}/${checks.length})`} />
      <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {checks.map((check) => (
            <div
              key={check.label}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                check.ok ? 'bg-green-50/50' : 'bg-red-50/50'
              )}
            >
              {check.ok ? (
                <IconCheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
              ) : (
                <IconXCircle size={14} className="text-red-400 flex-shrink-0" />
              )}
              <span className={cn(
                'font-medium',
                check.ok ? 'text-green-700' : 'text-red-600'
              )}>
                {check.label}
              </span>
              <span className={cn(
                'ml-auto text-eyebrow',
                check.ok ? 'text-green-500' : 'text-red-400'
              )}>
                {check.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// SECTION LABEL
// ============================================================================

function SectionLabel({ label }: { label: string }) {
  return (
    <h3 className="text-eyebrow font-semibold text-warm-500 uppercase tracking-wider mb-2">
      {label}
    </h3>
  );
}
