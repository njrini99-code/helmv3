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
import type {
  CoachEngagement,
  CoachTemperature,
  TimelineItem as TimelineItemType,
} from '@/app/golf/admin/crm/types/foundations';
import { EngagementSparkline } from './EngagementSparkline';
import { IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/fairway';

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
  // Mirrors ./EngagementBadge.tsx's ramp — a hot lead is a positive signal, so
  // it takes the solid accent fill; amber/red stay reserved for deliverability
  // failures. Cold sits neutral, Warm on the accent wash.
  hot: {
    label: 'Hot',
    Icon: IconFlame,
    iconClass: 'text-text-on-accent',
    pillClass: 'bg-accent-650 text-text-on-accent border-accent-700',
    scoreClass: 'text-fw-success-ink',
  },
  warm: {
    label: 'Warm',
    Icon: IconSparkles,
    iconClass: 'text-accent-700',
    pillClass: 'bg-accent-50 text-accent-700 border-accent-200',
    scoreClass: 'text-accent-700',
  },
  cold: {
    label: 'Cold',
    Icon: IconStar,
    iconClass: 'text-text-tertiary',
    pillClass: 'bg-surface-sunken text-text-tertiary border-border-subtle',
    scoreClass: 'text-text-tertiary',
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
  // Escalating accent ramp (see resend/shared.tsx STATUS_CONFIG for the rule).
  sent: 'bg-surface-sunken text-text-secondary border-border-subtle',
  delivered: 'bg-accent-50 text-accent-700 border-accent-200',
  opened: 'bg-accent-100 text-fw-success-ink border-accent-300',
  clicked: 'bg-accent-650 text-text-on-accent border-accent-700',
  bounced: 'bg-fw-danger-bg text-fw-danger-ink border-fw-danger/25',
  complained: 'bg-fw-danger-bg text-fw-danger-ink border-fw-danger/25',
  unsubscribed: 'bg-fw-danger-bg text-fw-danger-ink border-fw-danger/25',
  failed: 'bg-fw-danger-bg text-fw-danger-ink border-fw-danger/25',
  delivery_delayed: 'bg-fw-warning-bg text-fw-warning-ink border-fw-warning-ring',
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
    } catch {
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
        className="fixed inset-0 z-50 bg-nav-bg/35 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="engagement-drawer-title"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-elevated shadow-raise border-l border-border-subtle flex flex-col"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-fw-sm bg-surface-sunken flex items-center justify-center flex-shrink-0">
              <IconActivity size={16} className="text-text-secondary" />
            </span>
            <div className="min-w-0">
              <h2 id="engagement-drawer-title" className="text-base font-semibold text-text-primary truncate">
                Engagement detail
              </h2>
              {coachName && (
                <p className="text-xs text-text-tertiary truncate">{coachName}</p>
              )}
            </div>
          </div>
          <IconButton variant="default"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors"
          >
            <IconX size={14} />
          </IconButton>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {loading && !engagement && (
            <div className="space-y-3">
              <div className="h-24 rounded-card bg-surface-sunken/70 skeleton-shimmer" />
              <div className="h-32 rounded-card bg-surface-sunken/70 skeleton-shimmer" />
            </div>
          )}

          {error && (
            <p className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2">
              {error}
            </p>
          )}

          {!loading && !error && !engagement && (
            <div className="rounded-card border border-dashed border-border-subtle bg-surface-sunken/60">
              <EmptyState
                variant="subtle"
                icon={<IconActivity size={18} />}
                title="No engagement data yet"
                description="Once this coach starts opening or clicking emails, their score populates here."
              />
            </div>
          )}

          {engagement && tone && (
            <>
              {/* Score card */}
              <section className="rounded-card border border-border-subtle bg-surface p-4">
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
                    <p className="mt-2 text-xs text-text-tertiary">Engagement score</p>
                    <p className={cn('mt-0.5 text-3xl font-semibold tabular-nums', tone.scoreClass)}>
                      {engagement.score}
                      <span className="text-sm font-normal text-text-tertiary ml-1">/100</span>
                    </p>
                  </div>
                  <EngagementSparkline engagement={engagement} width={96} height={32} />
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-fw-sm bg-surface-sunken/70 px-2 py-2">
                    <dt className="text-eyebrow uppercase tracking-wider text-text-tertiary">
                      Opens
                    </dt>
                    <dd className="text-lg font-semibold text-text-primary tabular-nums">
                      {engagement.opens_90d}
                    </dd>
                    <dd className="text-eyebrow text-text-tertiary">last 90d</dd>
                  </div>
                  <div className="rounded-fw-sm bg-surface-sunken/70 px-2 py-2">
                    <dt className="text-eyebrow uppercase tracking-wider text-text-tertiary">
                      Clicks
                    </dt>
                    <dd className="text-lg font-semibold text-text-primary tabular-nums">
                      {engagement.clicks_90d}
                    </dd>
                    <dd className="text-eyebrow text-text-tertiary">last 90d</dd>
                  </div>
                  <div className="rounded-fw-sm bg-surface-sunken/70 px-2 py-2">
                    <dt className="text-eyebrow uppercase tracking-wider text-text-tertiary">
                      Last event
                    </dt>
                    <dd className="text-sm font-semibold text-text-primary">
                      {lastEventLabel ?? '—'}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Why this score */}
              {explainer && (
                <section className="rounded-card border border-border-subtle bg-surface-sunken/60 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2">
                    Why this score?
                  </h3>
                  <p className="text-sm text-text-primary leading-relaxed">
                    {explainer}
                  </p>
                  <p className="mt-2 text-eyebrow text-text-tertiary">
                    Score uses a 14-day half-life decay over the last 90 days
                    of email events. Hot ≥ 60, Warm ≥ 25, Cold &lt; 25.
                  </p>
                </section>
              )}

              {/* Recent events */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-2">
                  <IconMail size={12} className="text-text-tertiary" />
                  Recent email events
                </h3>
                {events.length === 0 ? (
                  <p className="text-xs text-text-tertiary italic px-1">
                    No email events in the last 90 days.
                  </p>
                ) : (
                  <ul className="rounded-card border border-border-subtle bg-surface divide-y divide-border-subtle">
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

  const tone = EMAIL_EVENT_TONE[event.type] ?? 'bg-surface-sunken text-text-secondary border-border-subtle';
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
            <span className="text-eyebrow text-text-tertiary truncate">
              {recipient}
            </span>
          )}
        </div>
      </div>
      <span
        className="text-eyebrow text-text-tertiary tabular-nums flex-shrink-0"
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
