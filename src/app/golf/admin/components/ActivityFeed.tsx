'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import {
  IconActivity,
  IconShield,
  IconWarning,
  IconBot,
  IconCheckCircle2,
  IconClock3,
  IconRoute,
  IconTarget,
  IconUser,
  IconWrench,
} from '@/components/icons';
import { timeAgo } from './admin-utils';
import { useAdminRealtimeContext } from './AdminRealtimeProvider';

interface Props {
  activity: AdminDashboardData['activity'];
}

type FeedFilter = 'all' | 'users' | 'golf' | 'ops' | 'issues';
type TimelineKind = 'signup' | 'round' | 'insight' | 'admin_event' | 'audit';

interface TimelineItem {
  id: string;
  kind: TimelineKind;
  filter: FeedFilter;
  title: string;
  detail: string | null;
  timestamp: string | null;
  badge: string;
  live: boolean;
  severity: 'info' | 'warning' | 'error' | 'critical' | null;
}

const itemStyles: Record<TimelineKind, { icon: ReactNode; chip: string; rail: string }> = {
  signup: {
    icon: <IconUser size={13} />,
    chip: 'bg-blue-100 text-blue-700',
    rail: 'bg-blue-400',
  },
  round: {
    icon: <IconTarget size={13} />,
    chip: 'bg-primary-100 text-primary-700',
    rail: 'bg-primary-400',
  },
  insight: {
    icon: <IconBot size={13} />,
    chip: 'bg-violet-100 text-violet-700',
    rail: 'bg-violet-400',
  },
  admin_event: {
    icon: <IconShield size={13} />,
    chip: 'bg-amber-100 text-amber-700',
    rail: 'bg-amber-400',
  },
  audit: {
    icon: <IconWrench size={13} />,
    chip: 'bg-warm-100 text-warm-700',
    rail: 'bg-warm-400',
  },
};

const severityPills: Record<NonNullable<TimelineItem['severity']>, string> = {
  info: 'bg-blue-50 text-blue-700',
  warning: 'bg-amber-50 text-amber-700',
  error: 'bg-rose-50 text-rose-700',
  critical: 'bg-red-50 text-red-700',
};

function getDateGroupLabel(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (itemDate.getTime() === today.getTime()) return 'Today';
  if (itemDate.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatScore(totalScore: number | null, totalToPar: number | null): string | null {
  if (totalScore == null && totalToPar == null) return null;
  const score = totalScore != null ? `${totalScore}` : 'Round';
  if (totalToPar == null) return score;
  if (totalToPar === 0) return `${score} (E)`;
  return `${score} (${totalToPar > 0 ? `+${totalToPar}` : totalToPar})`;
}

function formatAdminEventDetail(event: Props['activity']['recentAdminEvents'][number]): string | null {
  const parts = [
    event.userEmail,
    event.url ? event.url.replace(/\/:id/g, '/...') : null,
    event.message,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatAuditDetail(event: Props['activity']['recentAuditEvents'][number]): string | null {
  const parts = [
    event.userEmail,
    event.tableName ? event.tableName.replace(/^golf_/, '').replace(/_/g, ' ') : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : null;
}

function mapRealtimeEventToTimelineItem(
  event: ReturnType<typeof useAdminRealtimeContext>['realtime']['events'][number],
): TimelineItem | null {
  if (['signup', 'round_submitted', 'ai_generation'].includes(event.event_type)) {
    return null;
  }

  const filter: FeedFilter = event.event_type === 'error' || event.event_type === 'client_error' || event.event_type === 'api_error'
    ? 'issues'
    : event.event_type === 'login'
      ? 'users'
      : 'ops';

  return {
    id: `live-${event.id}`,
    kind: 'admin_event',
    filter,
    title: event.title,
    detail: [event.user_email, event.url, event.message].filter(Boolean).join(' • ') || null,
    timestamp: event.created_at,
    badge: filter === 'issues' ? 'Live issue' : 'Live event',
    live: true,
    severity: event.severity,
  };
}

export function ActivityFeed({ activity }: Props) {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const { realtime } = useAdminRealtimeContext();

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items = new Map<string, TimelineItem>();

    for (const event of realtime.events) {
      const item = mapRealtimeEventToTimelineItem(event);
      if (!item) continue;
      items.set(item.id, item);
    }

    for (const signup of activity.recentSignups) {
      items.set(`signup-${signup.id}`, {
        id: `signup-${signup.id}`,
        kind: 'signup',
        filter: 'users',
        title: signup.email,
        detail: signup.role ? `${signup.role} account created` : 'New account created',
        timestamp: signup.created_at,
        badge: 'Signup',
        live: false,
        severity: null,
      });
    }

    for (const round of activity.recentRounds) {
      const scoreStr = formatScore(round.total_score, round.total_to_par);
      items.set(`round-${round.id}`, {
        id: `round-${round.id}`,
        kind: 'round',
        filter: 'golf',
        title: scoreStr
          ? `${round.player_name} shot ${scoreStr}`
          : `${round.player_name} submitted a round`,
        detail: [
          round.course_name ? `at ${round.course_name}` : null,
          round.round_type ? round.round_type.replace(/_/g, ' ') : null,
        ].filter(Boolean).join(' · ') || null,
        timestamp: round.created_at,
        badge: 'Round',
        live: false,
        severity: null,
      });
    }

    for (const insight of activity.recentInsights) {
      items.set(`insight-${insight.id}`, {
        id: `insight-${insight.id}`,
        kind: 'insight',
        filter: 'golf',
        title: insight.insight_type || 'CoachHelm insight generated',
        detail: insight.insights_generated != null ? `${insight.insights_generated} insights generated` : 'AI output created',
        timestamp: insight.created_at,
        badge: 'AI',
        live: false,
        severity: null,
      });
    }

    for (const event of activity.recentAdminEvents) {
      if (['signup', 'round_submitted', 'ai_generation'].includes(event.eventType)) continue;
      const itemFilter: FeedFilter = event.eventType === 'error' || event.eventType === 'client_error' || event.eventType === 'api_error'
        ? 'issues'
        : event.eventType === 'login'
          ? 'users'
          : 'ops';

      const key = `live-${event.id}`;
      if (items.has(key)) continue;

      items.set(key, {
        id: key,
        kind: 'admin_event',
        filter: itemFilter,
        title: event.title,
        detail: formatAdminEventDetail(event),
        timestamp: event.createdAt,
        badge: itemFilter === 'issues' ? 'Issue' : event.eventType.replace(/_/g, ' '),
        live: false,
        severity: (event.severity === 'info' || event.severity === 'warning' || event.severity === 'error' || event.severity === 'critical')
          ? event.severity
          : null,
      });
    }

    for (const event of activity.recentAuditEvents) {
      const formattedAction = event.action.replace(/_/g, ' ');
      const capitalizedAction = formattedAction.charAt(0).toUpperCase() + formattedAction.slice(1);
      items.set(`audit-${event.id}`, {
        id: `audit-${event.id}`,
        kind: 'audit',
        filter: 'ops',
        title: capitalizedAction,
        detail: formatAuditDetail(event),
        timestamp: event.createdAt,
        badge: 'Audit',
        live: false,
        severity: null,
      });
    }

    return Array.from(items.values()).sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [activity, realtime.events]);

  const visibleItems = useMemo(
    () => timelineItems.filter((item) => filter === 'all' || item.filter === filter),
    [timelineItems, filter],
  );

  const counts = useMemo(() => ({
    users: timelineItems.filter((item) => item.filter === 'users').length,
    golf: timelineItems.filter((item) => item.filter === 'golf').length,
    ops: timelineItems.filter((item) => item.filter === 'ops').length,
    issues: timelineItems.filter((item) => item.filter === 'issues').length,
    live: timelineItems.filter((item) => item.live).length,
  }), [timelineItems]);

  const leadItem = visibleItems[0] ?? null;

  return (
    <div className="glass-standard rounded-2xl p-4 sm:p-5 md:p-6">
      {/* Top header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
              <IconActivity size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-warm-900">
                Live Activity Feed
              </h3>
              <p className="text-xs sm:text-sm text-warm-500 leading-relaxed">
                Signups, rounds, CoachHelm activity, audit actions, and live events in one stream.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:text-sm font-medium',
            realtime.isConnected
              ? 'border-primary-200 bg-primary-50 text-primary-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          )}>
            <span className={cn(
              'h-2 w-2 rounded-full shrink-0',
              realtime.isConnected ? 'bg-primary-500' : 'bg-amber-500'
            )} />
            {realtime.isConnected ? 'Realtime connected' : 'Realtime reconnecting'}
          </span>
        </div>
      </div>

      {/* Stats mini-grid — 2-col on mobile, 3-col on sm, 5-col on xl */}
      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border border-white/35 bg-white/60 px-3 py-2.5 sm:py-3 sm:px-4">
          <p className="text-eyebrow sm:text-eyebrow font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-warm-400">
            Stream
          </p>
          <p className="mt-1 text-lg sm:text-xl font-semibold tabular-nums text-warm-900">
            {timelineItems.length}
          </p>
          <p className="mt-0.5 text-eyebrow sm:text-xs text-warm-500">last 20/source</p>
        </div>
        <div className="rounded-2xl border border-white/35 bg-white/60 px-3 py-2.5 sm:py-3 sm:px-4">
          <p className="text-eyebrow sm:text-eyebrow font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-warm-400">
            Live now
          </p>
          <p className="mt-1 text-lg sm:text-xl font-semibold tabular-nums text-warm-900">
            {counts.live}
          </p>
          <p className="mt-0.5 text-eyebrow sm:text-xs text-warm-500">realtime</p>
        </div>
        <div className="rounded-2xl border border-white/35 bg-white/60 px-3 py-2.5 sm:py-3 sm:px-4">
          <p className="text-eyebrow sm:text-eyebrow font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-warm-400">
            Users
          </p>
          <p className="mt-1 text-lg sm:text-xl font-semibold tabular-nums text-warm-900">
            {counts.users}
          </p>
          <p className="mt-0.5 text-eyebrow sm:text-xs text-warm-500">signups &amp; logins</p>
        </div>
        <div className="rounded-2xl border border-white/35 bg-white/60 px-3 py-2.5 sm:py-3 sm:px-4">
          <p className="text-eyebrow sm:text-eyebrow font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-warm-400">
            Golf
          </p>
          <p className="mt-1 text-lg sm:text-xl font-semibold tabular-nums text-warm-900">
            {counts.golf}
          </p>
          <p className="mt-0.5 text-eyebrow sm:text-xs text-warm-500">rounds &amp; AI</p>
        </div>
        <div className="rounded-2xl border border-white/35 bg-white/60 px-3 py-2.5 sm:py-3 sm:px-4 col-span-2 sm:col-span-1">
          <p className="text-eyebrow sm:text-eyebrow font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-warm-400">
            Ops / issues
          </p>
          <p className="mt-1 text-lg sm:text-xl font-semibold tabular-nums text-warm-900">
            {counts.ops + counts.issues}
          </p>
          <p className="mt-0.5 text-eyebrow sm:text-xs text-warm-500">{counts.issues} issue signals</p>
        </div>
      </div>

      {/* Focus + Timeline — stacked on mobile, side-by-side on xl */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        {/* Focus / filter panel */}
        <div className="rounded-2xl border border-white/35 bg-white/55 p-4">
          <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-warm-500">
            Focus
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              { value: 'all', label: 'All', count: timelineItems.length },
              { value: 'users', label: 'Users', count: counts.users },
              { value: 'golf', label: 'Golf', count: counts.golf },
              { value: 'ops', label: 'Ops', count: counts.ops },
              { value: 'issues', label: 'Issues', count: counts.issues },
            ] as { value: FeedFilter; label: string; count: number }[]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-2.5 text-xs transition-colors min-h-[44px]',
                  filter === option.value
                    ? 'border-warm-300 bg-white text-warm-900 shadow-sm'
                    : 'border-white/30 bg-white/50 text-warm-500 hover:bg-white/70'
                )}
              >
                <span>{option.label}</span>
                <span className="rounded-full bg-warm-100 px-2 py-0.5 text-eyebrow font-semibold text-warm-600 tabular-nums">
                  {option.count}
                </span>
              </button>
            ))}
          </div>

          {leadItem ? (
            <div className="mt-4 rounded-2xl border border-white/35 bg-white/70 p-4">
              <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-warm-500">
                Lead item
              </p>
              <p className="mt-2 text-sm sm:text-base font-semibold text-warm-900 break-words line-clamp-2">
                {leadItem.title}
              </p>
              <p className="mt-1 text-xs sm:text-sm leading-5 sm:leading-6 text-warm-600 line-clamp-3 break-words">
                {leadItem.detail ?? 'No additional detail captured.'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                  itemStyles[leadItem.kind].chip
                )}>
                  {leadItem.badge}
                </span>
                {leadItem.severity && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                    severityPills[leadItem.severity]
                  )}>
                    {leadItem.severity}
                  </span>
                )}
                {leadItem.live && (
                  <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                    live
                  </span>
                )}
                <span className="text-xs text-warm-400">{timeAgo(leadItem.timestamp)}</span>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-primary-100 bg-primary-50/50 px-4 py-6 text-center">
              <IconCheckCircle2 size={18} className="mx-auto text-primary-600" />
              <p className="mt-2 text-sm font-medium text-primary-700">
                No recent activity captured
              </p>
            </div>
          )}
        </div>

        {/* Timeline panel */}
        <div className="rounded-2xl border border-white/35 bg-white/55 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-warm-500">
              Timeline
            </p>
            <p className="text-xs text-warm-400">{visibleItems.length} visible items</p>
          </div>

          {visibleItems.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white/70 px-4 py-8 text-center text-sm text-warm-500">
              No activity in this filter.
            </div>
          ) : (
            <div className="mt-4 max-h-[560px] space-y-0 overflow-y-auto pr-1">
              {visibleItems.slice(0, 28).map((item, index) => {
                const itemStyle = itemStyles[item.kind];
                const showLine = index < Math.min(visibleItems.length, 28) - 1;

                // Show date header when the date group changes
                const currentGroup = getDateGroupLabel(item.timestamp);
                const prevGroup = index > 0 ? getDateGroupLabel(visibleItems[index - 1]!.timestamp) : null;
                const showDateHeader = currentGroup !== prevGroup;

                return (
                  <div key={item.id}>
                    {showDateHeader && (
                      <div className={cn('flex items-center gap-3 pb-2', index === 0 ? 'pt-0' : 'pt-4')}>
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-warm-200 to-transparent" />
                        <span className="text-eyebrow font-bold uppercase tracking-[0.2em] text-warm-500 bg-white/80 px-2.5 py-1 rounded-full border border-warm-100 shrink-0">
                          {currentGroup}
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-warm-200 to-transparent" />
                      </div>
                    )}
                    <div className="relative flex items-start gap-3 py-3">
                      {showLine && (
                        <div className="absolute left-[15px] top-9 bottom-0 w-px bg-warm-100" />
                      )}

                      <div className={cn(
                        'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl',
                        itemStyle.chip
                      )}>
                        {itemStyle.icon}
                      </div>

                      <div className={cn('absolute left-[14px] top-8 h-3 w-1 rounded-full', itemStyle.rail)} />

                      <div className={cn(
                        'min-w-0 flex-1 rounded-2xl border px-3 py-3 sm:px-4',
                        item.severity === 'error' || item.severity === 'critical'
                          ? 'border-red-100 bg-red-50/40'
                          : item.badge.toLowerCase() === 'login' || item.badge.toLowerCase() === 'page view'
                            ? 'border-white/20 bg-white/50'
                            : 'border-white/35 bg-white/72'
                      )}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              {/* Title — truncate long names on mobile, muted for login events */}
                              <p className={cn(
                                'text-xs sm:text-sm truncate max-w-[180px] sm:max-w-none',
                                item.badge.toLowerCase() === 'login' || item.badge.toLowerCase() === 'page view'
                                  ? 'font-medium text-warm-500'
                                  : 'font-semibold text-warm-900'
                              )}>
                                {item.title}
                              </p>
                              <span className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-eyebrow font-semibold uppercase tracking-[0.14em]',
                                itemStyle.chip
                              )}>
                                {item.badge}
                              </span>
                              {item.severity && (
                                <span className={cn(
                                  'inline-flex items-center rounded-full px-2 py-0.5 text-eyebrow font-semibold uppercase tracking-[0.14em]',
                                  severityPills[item.severity]
                                )}>
                                  {item.severity}
                                </span>
                              )}
                              {item.live && (
                                <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-eyebrow font-semibold uppercase tracking-[0.14em] text-primary-700">
                                  live
                                </span>
                              )}
                            </div>
                            {item.detail && (
                              <p className="mt-1 text-xs sm:text-sm leading-5 text-warm-600 line-clamp-2 break-words">
                                {item.detail}
                              </p>
                            )}
                          </div>

                          {/* Timestamp — always abbreviated, right-aligned */}
                          <div className="flex items-center gap-1 text-xs text-warm-400 tabular-nums shrink-0">
                            {item.filter === 'issues'
                              ? <IconWarning size={11} />
                              : item.filter === 'ops'
                                ? <IconRoute size={11} />
                                : <IconClock3 size={11} />}
                            <span>{timeAgo(item.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
