'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Layers3,
  Route,
  ShieldAlert,
  User,
} from 'lucide-react';
import { AdminAreaChart, AdminDonutChart, AdminProgressBar } from '../AdminChart';
import { timeAgo } from '../admin-utils';
import type { ErrorGroup, AffectedPlayer, DailyCount, TracerErrorLog } from './tracer-types';

interface TracerErrorAnalyticsProps {
  errorGroups: ErrorGroup[];
  affectedPlayers: AffectedPlayer[];
  dailyErrorCounts: DailyCount[];
  recentErrors: TracerErrorLog[];
  totalErrors7d: number;
  criticalErrors7d: number;
}

type TimeRange = '7d' | '14d' | '30d';
type FeedMode = 'all' | 'critical' | 'recent';

interface TracerErrorContext {
  action: string | null;
  route: string | null;
  url: string | null;
  featureArea: string | null;
  requestId: string | null;
  roundId: string | null;
  playerId: string | null;
  userId: string | null;
  userEmail: string | null;
  errorCode: string | null;
  errorHint: string | null;
  errorDetails: string | null;
  source: string | null;
}

interface TracerIncident {
  id: string;
  severity: 'critical' | 'error' | 'warning' | 'info';
  title: string;
  summary: string;
  likelyCause: string;
  operatorImpact: string;
  nextStep: string;
  featureArea: string;
  action: string | null;
  route: string | null;
  url: string | null;
  requestId: string | null;
  errorCode: string | null;
  errorHint: string | null;
  errorDetails: string | null;
  source: string | null;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  sampleMessage: string;
  sampleStack: string | null;
  sampleContext: Record<string, unknown> | null;
  roundIds: string[];
  playerIds: string[];
  userEmails: string[];
  copySummary: string;
}

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

const severityOrder: Record<TracerIncident['severity'], number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeSeverity(severity: string | null | undefined): TracerIncident['severity'] {
  const normalized = severity?.toLowerCase();
  if (normalized === 'critical' || normalized === 'error' || normalized === 'warning' || normalized === 'info') {
    return normalized;
  }
  return 'error';
}

function normalizeRoute(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url;
  }
}

function buildTracerContext(rawContext: unknown): TracerErrorContext {
  const context = asObject(rawContext);
  return {
    action: asString(context?.action),
    route: asString(context?.route),
    url: asString(context?.url),
    featureArea: asString(context?.featureArea),
    requestId: asString(context?.requestId),
    roundId: asString(context?.roundId),
    playerId: asString(context?.playerId),
    userId: asString(context?.userId),
    userEmail: asString(context?.userEmail),
    errorCode: asString(context?.errorCode),
    errorHint: asString(context?.errorHint),
    errorDetails: asString(context?.errorDetails),
    source: asString(context?.source),
  };
}

function mergeTracerContext(primary: TracerErrorContext, fallback: TracerErrorContext): TracerErrorContext {
  return {
    action: primary.action ?? fallback.action,
    route: primary.route ?? fallback.route,
    url: primary.url ?? fallback.url,
    featureArea: primary.featureArea ?? fallback.featureArea,
    requestId: primary.requestId ?? fallback.requestId,
    roundId: primary.roundId ?? fallback.roundId,
    playerId: primary.playerId ?? fallback.playerId,
    userId: primary.userId ?? fallback.userId,
    userEmail: primary.userEmail ?? fallback.userEmail,
    errorCode: primary.errorCode ?? fallback.errorCode,
    errorHint: primary.errorHint ?? fallback.errorHint,
    errorDetails: primary.errorDetails ?? fallback.errorDetails,
    source: primary.source ?? fallback.source,
  };
}

function normalizeMessageForKey(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[id]')
    .replace(/\b\d{4,}\b/g, '[num]')
    .trim();
}

function toFeatureAreaLabel(context: TracerErrorContext, error: TracerErrorLog): string {
  const featureArea = context.featureArea?.toLowerCase() ?? '';
  const url = normalizeRoute(context.url ?? error.url)?.toLowerCase() ?? '';
  const action = context.action?.toLowerCase() ?? '';
  const message = error.message.toLowerCase();

  if (featureArea === 'shot_tracking' || action.includes('round') || message.includes('round')) return 'Shot Tracking';
  if (featureArea === 'stats_cache' || message.includes('stats cache') || message.includes('strokes gained')) return 'Stats Cache';
  if (message.includes('continue round')) return 'Continue Round';
  if (url.includes('/rounds')) return 'Rounds';
  if (url.includes('/stats')) return 'Stats';
  return 'Tracer';
}

function deriveTracerNarrative(
  message: string,
  featureArea: string,
  action: string | null,
  errorCode: string | null,
): Pick<TracerIncident, 'title' | 'summary' | 'likelyCause' | 'operatorImpact' | 'nextStep'> {
  const normalized = message.toLowerCase();

  if (normalized.includes('stack depth limit exceeded')) {
    return {
      title: 'Round submit recursion failure',
      summary: 'Shot tracking hit PostgreSQL recursion depth during a save or submit path.',
      likelyCause: 'A round submit function or trigger is re-entering too deeply while trying to repair totals or cache state.',
      operatorImpact: 'Players can get blocked on submit and may retry the same round multiple times.',
      nextStep: 'Inspect submit_round_atomic and any post-submit cache triggers for recursive writes.',
    };
  }

  if (normalized.includes('created_at') && normalized.includes('ambiguous')) {
    return {
      title: 'Stats refresh query is ambiguous',
      summary: 'A shot-tracking save path reached SQL that references created_at without a qualifying table alias.',
      likelyCause: 'A joined query in the stats refresh or cache repair path is ordering or filtering on an unqualified created_at column.',
      operatorImpact: 'Round submit can fail even when the tracked round data itself is valid.',
      nextStep: 'Review refresh_player_stats_cache and related SQL/RPC functions for unqualified created_at usage.',
    };
  }

  if (normalized.includes('putt_details_distance_feet_check')) {
    return {
      title: 'Putt distance rejected by constraint',
      summary: 'Tracer caught a putt detail insert whose distance violated the database range check.',
      likelyCause: 'The save flow is deriving or converting a putt distance outside the allowed DB bounds.',
      operatorImpact: 'A player can lose a round submit because one putt detail row is invalid.',
      nextStep: 'Compare the submitted putt distance with derivePuttDistanceFeet and the DB constraint values.',
    };
  }

  if (normalized.includes('approach_miss_details_lie_type_check')) {
    return {
      title: 'Approach lie type rejected by constraint',
      summary: 'Tracer found an approach miss detail row whose lie_type is no longer accepted by the database.',
      likelyCause: 'The app emitted a lie label that drifted from the current allowed DB enum/constraint values.',
      operatorImpact: 'Players can see a submit failure on otherwise valid approach data.',
      nextStep: 'Compare the app lie mapping against the live constraint values for approach_miss_details.',
    };
  }

  if (normalized.includes('continue round')) {
    return {
      title: 'Continue-round rehydration failed',
      summary: 'The tracer found a failure while trying to reload an in-progress round for resume.',
      likelyCause: 'One of the dependent reads for the round, holes, or shot detail records failed.',
      operatorImpact: 'Users can open the continue-round screen and hit missing data or a broken session.',
      nextStep: 'Use the round ID below to inspect the round and related shot/detail rows end to end.',
    };
  }

  if (
    normalized.includes('refresh_player_stats_cache')
    || normalized.includes('stats cache')
    || normalized.includes('mark_player_stats_stale')
    || normalized.includes('strokes gained')
  ) {
    return {
      title: 'Post-round cache repair failed',
      summary: 'A shot-tracking flow completed far enough to trigger cache or strokes-gained repair, and that repair failed.',
      likelyCause: 'A cache RPC or reconciliation step errored, timed out, or hit stale data.',
      operatorImpact: 'Round data may exist while derived stats stay stale or wrong.',
      nextStep: 'Check the cache RPC named below and compare live round totals with golf_player_stats_cache.',
    };
  }

  if (action === 'savePartialRound' || normalized.includes('save partial')) {
    return {
      title: 'Partial round save failed',
      summary: 'Tracer captured a failure while the player was still saving an in-progress round.',
      likelyCause: 'A validation, detail insert, or supporting update failed before the draft state persisted cleanly.',
      operatorImpact: 'The player can lose progress or see stale in-progress data after a save attempt.',
      nextStep: 'Inspect the route/action, round ID, and raw context below to find the failing draft save step.',
    };
  }

  if (action === 'submitGolfRoundComprehensive' || normalized.includes('round submit')) {
    return {
      title: 'Round submit failed',
      summary: 'Tracer captured a server-side failure in the final shot-tracking submit path.',
      likelyCause: 'The submit transaction hit a validation failure, DB constraint, trigger issue, or cache repair failure.',
      operatorImpact: 'A player likely saw the round fail to submit and may retry or abandon the save.',
      nextStep: 'Start with the raw message, action, round ID, and stack/context in this incident.',
    };
  }

  return {
    title: `${featureArea} tracer incident`,
    summary: 'Tracer captured a shot-tracking-side error that does not match a specialized diagnosis rule yet.',
    likelyCause: action
      ? `The ${action} path threw and logged structured context for review.`
      : 'A tracer-monitored shot tracking path failed without a more specific pattern match.',
    operatorImpact: 'Players or staff may have seen a failure or stale data in the tracer-monitored flow.',
    nextStep: errorCode
      ? `Review the raw message, error code ${errorCode}, and captured context below.`
      : 'Review the raw message, captured context, and stack below.',
  };
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

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

function buildCopySummary(incident: TracerIncident): string {
  return [
    `Severity: ${incident.severity.toUpperCase()}`,
    `Title: ${incident.title}`,
    `Area: ${incident.featureArea}`,
    `Summary: ${incident.summary}`,
    `Likely cause: ${incident.likelyCause}`,
    `Operator impact: ${incident.operatorImpact}`,
    `Next step: ${incident.nextStep}`,
    `Occurrences: ${incident.occurrences}`,
    `First seen: ${incident.firstSeen}`,
    `Last seen: ${incident.lastSeen}`,
    incident.action ? `Action: ${incident.action}` : null,
    incident.route ? `Route: ${incident.route}` : null,
    incident.url ? `URL: ${incident.url}` : null,
    incident.errorCode ? `Error code: ${incident.errorCode}` : null,
    incident.errorHint ? `Hint: ${incident.errorHint}` : null,
    incident.errorDetails ? `Details: ${incident.errorDetails}` : null,
    incident.requestId ? `Request ID: ${incident.requestId}` : null,
    incident.source ? `Trace source: ${incident.source}` : null,
    incident.roundIds.length > 0 ? `Round IDs: ${incident.roundIds.join(', ')}` : null,
    incident.playerIds.length > 0 ? `Player IDs: ${incident.playerIds.join(', ')}` : null,
    incident.userEmails.length > 0 ? `User emails: ${incident.userEmails.join(', ')}` : null,
    `Raw message: ${incident.sampleMessage}`,
    incident.sampleContext ? `Context JSON:\n${JSON.stringify(incident.sampleContext, null, 2)}` : null,
    incident.sampleStack ? `Stack:\n${incident.sampleStack}` : null,
  ].filter(Boolean).join('\n');
}

function buildIncidents(recentErrors: TracerErrorLog[]): TracerIncident[] {
  const groups = new Map<string, {
    severity: TracerIncident['severity'];
    latestError: TracerErrorLog;
    context: TracerErrorContext;
    sampleContext: Record<string, unknown> | null;
    firstSeen: string;
    lastSeen: string;
    occurrences: number;
    roundIds: Set<string>;
    playerIds: Set<string>;
    userEmails: Set<string>;
    sampleStack: string | null;
  }>();

  for (const error of recentErrors) {
    const context = buildTracerContext(error.context);
    const route = normalizeRoute(context.route ?? context.url ?? error.url);
    const key = [
      normalizeMessageForKey(error.message),
      context.action ?? '',
      context.errorCode ?? '',
      route ?? '',
    ].join('::');

    const createdAt = error.created_at ?? new Date().toISOString();
    const severity = normalizeSeverity(error.severity);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        severity,
        latestError: error,
        context,
        sampleContext: asObject(error.context),
        firstSeen: createdAt,
        lastSeen: createdAt,
        occurrences: 1,
        roundIds: new Set(context.roundId ? [context.roundId] : []),
        playerIds: new Set(context.playerId ? [context.playerId] : []),
        userEmails: new Set(context.userEmail ? [context.userEmail] : []),
        sampleStack: error.stack,
      });
      continue;
    }

    existing.occurrences += 1;
    if (context.roundId) existing.roundIds.add(context.roundId);
    if (context.playerId) existing.playerIds.add(context.playerId);
    if (context.userEmail) existing.userEmails.add(context.userEmail);
    if (error.stack) existing.sampleStack = error.stack;
    existing.context = mergeTracerContext(existing.context, context);
    if (!existing.sampleContext && asObject(error.context)) existing.sampleContext = asObject(error.context);
    if (createdAt < existing.firstSeen) existing.firstSeen = createdAt;

    if (createdAt >= existing.lastSeen) {
      existing.lastSeen = createdAt;
      existing.latestError = error;
      existing.context = mergeTracerContext(context, existing.context);
      existing.sampleContext = asObject(error.context) ?? existing.sampleContext;
    }

    if (severityOrder[severity] < severityOrder[existing.severity]) {
      existing.severity = severity;
    }
  }

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const featureArea = toFeatureAreaLabel(group.context, group.latestError);
      const route = normalizeRoute(group.context.route ?? group.context.url ?? group.latestError.url);
      const narrative = deriveTracerNarrative(
        group.latestError.message,
        featureArea,
        group.context.action,
        group.context.errorCode,
      );

      const incident: TracerIncident = {
        id: key,
        severity: group.severity,
        title: narrative.title,
        summary: narrative.summary,
        likelyCause: narrative.likelyCause,
        operatorImpact: narrative.operatorImpact,
        nextStep: narrative.nextStep,
        featureArea,
        action: group.context.action,
        route,
        url: group.context.url ?? group.latestError.url,
        requestId: group.context.requestId,
        errorCode: group.context.errorCode,
        errorHint: group.context.errorHint,
        errorDetails: group.context.errorDetails,
        source: group.context.source,
        firstSeen: group.firstSeen,
        lastSeen: group.lastSeen,
        occurrences: group.occurrences,
        sampleMessage: group.latestError.message,
        sampleStack: group.sampleStack,
        sampleContext: group.sampleContext,
        roundIds: Array.from(group.roundIds).slice(0, 6),
        playerIds: Array.from(group.playerIds).slice(0, 6),
        userEmails: Array.from(group.userEmails).slice(0, 6),
        copySummary: '',
      };

      incident.copySummary = buildCopySummary(incident);
      return incident;
    })
    .sort((a, b) => {
      const currentA = new Date(a.lastSeen).getTime() >= Date.now() - 24 * 60 * 60 * 1000 ? 0 : 1;
      const currentB = new Date(b.lastSeen).getTime() >= Date.now() - 24 * 60 * 60 * 1000 ? 0 : 1;
      if (currentA !== currentB) return currentA - currentB;

      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      const lastSeenDiff = new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
      if (lastSeenDiff !== 0) return lastSeenDiff;

      return b.occurrences - a.occurrences;
    });
}

export default function TracerErrorAnalytics({
  errorGroups,
  affectedPlayers,
  dailyErrorCounts,
  recentErrors,
  totalErrors7d,
  criticalErrors7d,
}: TracerErrorAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [feedMode, setFeedMode] = useState<FeedMode>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<{ target: string; status: 'success' | 'error' } | null>(null);

  const incidents = useMemo(() => buildIncidents(recentErrors), [recentErrors]);

  const visibleIncidents = useMemo(() => {
    const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
    return incidents.filter((incident) => {
      if (feedMode === 'critical') return incident.severity === 'critical' || incident.severity === 'error';
      if (feedMode === 'recent') return new Date(incident.lastSeen).getTime() >= recentCutoff;
      return true;
    });
  }, [feedMode, incidents]);

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

    for (const error of recentErrors) {
      counts[normalizeSeverity(error.severity)] += 1;
    }

    return (Object.keys(counts) as TracerIncident['severity'][]).filter((severity) => counts[severity] > 0).map((severity) => ({
      label: severity.charAt(0).toUpperCase() + severity.slice(1),
      value: counts[severity],
      color: severityDonutColors[severity],
    }));
  }, [recentErrors]);

  const topPlayers = useMemo(() => affectedPlayers.slice(0, 5), [affectedPlayers]);
  const maxPlayerErrors = topPlayers.length > 0 ? topPlayers[0]!.errorCount : 1;
  const recentIncidentCount = incidents.filter((incident) => new Date(incident.lastSeen).getTime() >= Date.now() - 24 * 60 * 60 * 1000).length;

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
    .map((incident, index) => `Tracer Incident ${index + 1}\n${incident.copySummary}`)
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
                <h3 className="text-base font-semibold text-warm-900">Tracer Error Diagnostics</h3>
                <p className="text-sm text-warm-500">Grouped, copy-first shot-tracking incidents with raw context and stack trace on demand.</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleCopy(visibleFeedSummary || 'No tracer incidents in the current filter.', 'feed')}
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

        <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
          <MetaItem label="Raw traces" value={String(recentErrors.length)} />
          <MetaItem label="Grouped incidents" value={String(incidents.length)} />
          <MetaItem label="7d error volume" value={`${totalErrors7d} traces`} />
          <MetaItem label="Hot now" value={`${recentIncidentCount} current / ${criticalErrors7d} critical`} />
        </div>

        <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {([
              { value: 'all', label: 'All', count: incidents.length },
              { value: 'critical', label: 'Critical + error', count: incidents.filter((incident) => incident.severity === 'critical' || incident.severity === 'error').length },
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

          <p className="text-xs text-warm-500">Sorted current-first, then severity, then last seen.</p>
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

              return (
                <article
                  key={incident.id}
                  className={cn(
                    'rounded-2xl border bg-white/55 p-3.5 md:p-4',
                    style.border,
                    new Date(incident.lastSeen).getTime() >= Date.now() - 24 * 60 * 60 * 1000 && 'ring-1 ring-red-100'
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
                      </div>

                      <div className="mt-2 flex items-start gap-3">
                        <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/80', style.icon)}>
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
                        <NarrativePanel label="Operator Impact" body={incident.operatorImpact} />
                        <NarrativePanel label="Next Step" body={incident.nextStep} />
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
                <p className="text-xs text-warm-400">No player-linked tracer errors in the current slice.</p>
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
