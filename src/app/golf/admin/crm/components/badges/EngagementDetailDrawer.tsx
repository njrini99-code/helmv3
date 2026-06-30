'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  IconActivity,
  IconFlame,
  IconMail,
  IconSparkles,
  IconStar,
  IconX,
} from '@/components/icons';
import { getCoachEngagement } from '@/app/golf/actions/crm-engagement';
import { getCoachTimeline } from '@/app/golf/actions/crm-timeline';
import { logError } from '@/lib/error-logging';
import type {
  CoachEngagement,
  CoachTemperature,
  TimelineItem as TimelineItemType,
} from '@/app/golf/admin/crm/types/foundations';
import { EngagementSparkline } from './EngagementSparkline';
import { IconButton } from '@/components/ui/button';

// ============================================================================
// EngagementDetailDrawer — right-side slide-out shown when an engagement
// badge is clicked. Surfaces the score breakdown, sparkline, last 20 email
// events for the coach, and a "why this score?" explainer.
// ============================================================================

interface EngagementDetailDrawerProps {
  coachId: string;
  /** If the parent already has the engagement row, pass it to skip a fetch. */
  engagement?: CoachEngagement;
  /** Optional display name shown in the header. */
  coachName?: string;
  isOpen: boolean;
  onClose: () => void;
}

const TONES: Record<CoachTemperature, {
  label: string;
  Icon: typeof IconFlame;
  iconClass: string;
  pillClass: string;
  scoreClass: string;
}> = {
  hot: {
    label: 'Hot',
    Icon: IconFlame,
    iconClass: 'text-orange-500',
    pillClass: 'bg-gradient-to-r from-orange-50 to-red-50 text-orange-700 border-orange-200',
    scoreClass: 'text-orange-600',
  },
  warm: {
    label: 'Warm',
    Icon: IconSparkles,
    iconClass: 'text-amber-500',
    pillClass: 'bg-amber-50 text-amber-700 border-amber-200',
    scoreClass: 'text-amber-600',
  },
  cold: {
    label: 'Cold',
    Icon: IconStar,
    iconClass: 'text-warm-400',
    pillClass: 'bg-warm-50 text-warm-500 border-warm-200',
    scoreClass: 'text-warm-500',
  },
};

const EMAIL_EVENT_LABEL: Record<string, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  delivery_delayed: 'Delivery delayed',
  opened: 'Opened',
  clicked: 'Clicked',
  bounced: 'Bounced',
  complained: 'Complaint',
  unsubscribed: 'Unsubscribed',
  failed: 'Failed',
};

const EMAIL_EVENT_TONE: Record<string, string> = {
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  delivered: 'bg-blue-50 text-blue-700 border-blue-200',
  opened: 'bg-primary-50 text-primary-700 border-primary-200',
  clicked: 'bg-primary-50 text-primary-700 border-primary-200',
  bounced: 'bg-red-50 text-red-700 border-red-200',
  complained: 'bg-red-50 text-red-700 border-red-200',
  unsubscribed: 'bg-red-50 text-red-700 border-red-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  delivery_delayed: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function EngagementDetailDrawer({
  coachId,
  engagement: engagementProp,
  coachName,
  isOpen,
  onClose,
}: EngagementDetailDrawerProps) {
  const [engagement, setEngagement] = useState<CoachEngagement | undefined>(engagementProp);
  const [events, setEvents] = useState<TimelineItemType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync the prop into local state whenever the parent supplies a new value.
  useEffect(() => {
    setEngagement(engagementProp);
  }, [engagementProp]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tasks: Promise<void>[] = [];

      // Re-fetch engagement if the parent didn't provide one.
      if (!engagementProp) {
        tasks.push(
          getCoachEngagement([coachId]).then((map) => {
            setEngagement(map[coachId]);
          }),
        );
      }

      tasks.push(
        getCoachTimeline(coachId, { limit: 100 }).then((items) => {
          const onlyEmail = items
            .filter((i) => i.source === 'email_event')
            .slice(0, 20);
          setEvents(onlyEmail);
        }),
      );

      await Promise.all(tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load engagement detail');
    } finally {
      setLoading(false);
    }
  }, [coachId, engagementProp]);

  useEffect(() => {
    if (!isOpen) return;
    load();
  }, [isOpen, load]);

  const explainer = useMemo(() => buildExplainer(engagement), [engagement]);
  const lastEventLabel = useMemo(() => {
    if (!engagement?.last_event_at) return null;
    try {
      return formatDistanceToNow(new Date(engagement.last_event_at), { addSuffix: true });
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), {
        component: 'EngagementDetailDrawer',
        action: 'formatLastEvent',
      }, 'low');
      return null;
    }
  }, [engagement?.last_event_at]);

  if (!isOpen) return null;

  const tone = engagement ? TONES[engagement.temperature] : null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="engagement-drawer-title"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-white shadow-2xl border-l border-warm-200/60 flex flex-col"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-warm-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center flex-shrink-0">
              <IconActivity size={16} className="text-warm-600" />
            </span>
            <div className="min-w-0">
              <h2 id="engagement-drawer-title" className="text-base font-semibold text-warm-900 truncate">
                Engagement detail
              </h2>
              {coachName && (
                <p className="text-xs text-warm-500 truncate">{coachName}</p>
              )}
            </div>
          </div>
          <IconButton variant="default"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 transition-colors"
          >
            <IconX size={14} />
          </IconButton>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {loading && !engagement && (
            <div className="space-y-3">
              <div className="h-24 rounded-2xl bg-warm-50/60 skeleton-shimmer" />
              <div className="h-32 rounded-2xl bg-warm-50/60 skeleton-shimmer" />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {!loading && !error && !engagement && (
            <div className="rounded-2xl border border-dashed border-warm-200 bg-warm-50/40 px-4 py-10 text-center">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mx-auto mb-2 border border-warm-200/60">
                <IconActivity size={18} className="text-warm-400" />
              </div>
              <p className="text-sm font-medium text-warm-700">No engagement data yet</p>
              <p className="text-xs text-warm-500 mt-1 max-w-xs mx-auto">
                Once this coach starts opening or clicking emails, their score
                will populate here.
              </p>
            </div>
          )}

          {engagement && tone && (
            <>
              {/* Score card */}
              <section className="rounded-2xl border border-warm-200/60 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-eyebrow font-medium px-2 py-0.5 rounded-full border',
                        tone.pillClass,
                      )}
                    >
                      <tone.Icon size={11} className={tone.iconClass} />
                      {tone.label}
                    </span>
                    <p className="mt-2 text-xs text-warm-500">Engagement score</p>
                    <p className={cn('mt-0.5 text-3xl font-semibold tabular-nums', tone.scoreClass)}>
                      {engagement.score}
                      <span className="text-sm font-normal text-warm-400 ml-1">/100</span>
                    </p>
                  </div>
                  <EngagementSparkline engagement={engagement} width={96} height={32} />
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-warm-50/60 px-2 py-2">
                    <dt className="text-eyebrow uppercase tracking-wider text-warm-500">
                      Opens
                    </dt>
                    <dd className="text-lg font-semibold text-warm-900 tabular-nums">
                      {engagement.opens_90d}
                    </dd>
                    <dd className="text-eyebrow text-warm-400">last 90d</dd>
                  </div>
                  <div className="rounded-lg bg-warm-50/60 px-2 py-2">
                    <dt className="text-eyebrow uppercase tracking-wider text-warm-500">
                      Clicks
                    </dt>
                    <dd className="text-lg font-semibold text-warm-900 tabular-nums">
                      {engagement.clicks_90d}
                    </dd>
                    <dd className="text-eyebrow text-warm-400">last 90d</dd>
                  </div>
                  <div className="rounded-lg bg-warm-50/60 px-2 py-2">
                    <dt className="text-eyebrow uppercase tracking-wider text-warm-500">
                      Last event
                    </dt>
                    <dd className="text-sm font-semibold text-warm-900">
                      {lastEventLabel ?? '—'}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Why this score */}
              {explainer && (
                <section className="rounded-2xl border border-warm-200/60 bg-warm-50/40 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-600 mb-2">
                    Why this score?
                  </h3>
                  <p className="text-sm text-warm-800 leading-relaxed">
                    {explainer}
                  </p>
                  <p className="mt-2 text-eyebrow text-warm-500">
                    Score uses a 14-day half-life decay over the last 90 days
                    of email events. Hot ≥ 60, Warm ≥ 25, Cold &lt; 25.
                  </p>
                </section>
              )}

              {/* Recent events */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-600 mb-2 flex items-center gap-2">
                  <IconMail size={12} className="text-warm-500" />
                  Recent email events
                </h3>
                {events.length === 0 ? (
                  <p className="text-xs text-warm-500 italic px-1">
                    No email events in the last 90 days.
                  </p>
                ) : (
                  <ul className="rounded-2xl border border-warm-200/60 bg-white divide-y divide-warm-100">
                    {events.map((evt) => (
                      <EventRow key={evt.id} event={evt} />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// ----------------------------------------------------------------------------
// EventRow
// ----------------------------------------------------------------------------
interface EventRowProps {
  event: TimelineItemType;
}

function EventRow({ event }: EventRowProps) {
  const rel = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true });
    } catch {
      return '';
    }
  }, [event.occurred_at]);

  const absolute = useMemo(() => {
    try {
      return new Date(event.occurred_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return event.occurred_at;
    }
  }, [event.occurred_at]);

  const recipient = typeof event.metadata?.recipient_email === 'string'
    ? event.metadata.recipient_email
    : null;

  const tone = EMAIL_EVENT_TONE[event.type] ?? 'bg-warm-100 text-warm-700 border-warm-200';
  const label = EMAIL_EVENT_LABEL[event.type] ?? event.title ?? event.type;

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center text-eyebrow font-medium px-1.5 py-0.5 rounded-full border',
              tone,
            )}
          >
            {label}
          </span>
          {recipient && (
            <span className="text-eyebrow text-warm-500 truncate">
              {recipient}
            </span>
          )}
        </div>
      </div>
      <span
        className="text-eyebrow text-warm-400 tabular-nums flex-shrink-0"
        title={absolute}
      >
        {rel}
      </span>
    </li>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function buildExplainer(engagement?: CoachEngagement): string | null {
  if (!engagement) return null;

  const parts: string[] = [];
  const { temperature, opens_90d, clicks_90d, last_event_at } = engagement;

  if (clicks_90d > 0) {
    parts.push(`${clicks_90d} click${clicks_90d === 1 ? '' : 's'} in the last 90d`);
  }
  if (opens_90d > 0) {
    parts.push(`${opens_90d} open${opens_90d === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    return 'No opens or clicks in the last 90 days — score is at its floor.';
  }

  let recencyNote = '';
  if (last_event_at) {
    try {
      const days = Math.max(
        0,
        Math.floor((Date.now() - new Date(last_event_at).getTime()) / (1000 * 60 * 60 * 24)),
      );
      // 14-day half-life: factor = 0.5 ** (days / 14)
      const factor = Math.pow(0.5, days / 14);
      recencyNote = ` Most recent event was ${days === 0 ? 'today' : `${days}d ago`}, so the recency multiplier is ${factor.toFixed(2)}.`;
    } catch {
      /* noop */
    }
  }

  const verdict =
    temperature === 'hot'
      ? 'That puts this coach in the hot bucket.'
      : temperature === 'warm'
      ? 'That puts this coach in the warm bucket.'
      : 'That keeps this coach in the cold bucket.';

  return `${parts.join(', ')}.${recencyNote} ${verdict}`;
}
