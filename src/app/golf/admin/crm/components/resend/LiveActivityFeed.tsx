'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { IconRefresh, IconActivity } from '@/components/icons';
import type { EmailEventRow } from '@/app/golf/actions/resend-activity';
import { getRecentActivityFeed } from '@/app/golf/actions/resend-activity';
import { EVENT_CONFIG, formatRelative, formatFullTimestamp } from './shared';
import { useVisibilityAwareInterval } from '@/hooks/useVisibilityAwareInterval';
import { Button, IconButton } from '@/components/ui/button';

interface LiveActivityFeedProps {
  initialLimit?: number;
  onSelectMessage?: (resendMessageId: string) => void;
}

export function LiveActivityFeed({
  initialLimit = 50,
  onSelectMessage,
}: LiveActivityFeedProps) {
  const prefersReducedMotion = useReducedMotion();
  const [events, setEvents] = useState<EmailEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [, setTick] = useState(0);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await getRecentActivityFeed(initialLimit);
      if (cancelled) return;
      rows.forEach((r) => seenIdsRef.current.add(r.id));
      setEvents(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialLimit]);

  // Realtime subscription to email_events
  useEffect(() => {
    if (isPaused) return;
    const supabase = createClient();

    const channel = supabase
      .channel('resend-activity-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'email_events',
        },
        (payload) => {
          const row = payload.new as EmailEventRow;
          if (!row?.id || seenIdsRef.current.has(row.id)) return;
          seenIdsRef.current.add(row.id);

          setEvents((prev) => {
            // prepend, cap at 200 to prevent unbounded growth
            const next = [row, ...prev];
            return next.slice(0, 200);
          });
          setLiveCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isPaused]);

  // Tick every 30s to update relative times. Pauses when the tab is
  // hidden so we don't re-render the feed while off-screen.
  const tickRelativeTimes = useCallback(() => setTick((t) => t + 1), []);
  useVisibilityAwareInterval(tickRelativeTimes, 30_000);

  const handleRefresh = async () => {
    setLoading(true);
    const rows = await getRecentActivityFeed(initialLimit);
    seenIdsRef.current = new Set(rows.map((r) => r.id));
    setEvents(rows);
    setLiveCount(0);
    setLoading(false);
  };

  return (
    <div className="glass-standard rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100/60">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
            <IconActivity size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-warm-900">Live activity</p>
            <p className="text-xs text-warm-500 mt-0.5">
              Real-time email events from Resend
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {liveCount > 0 && (
            <motion.span
              initial={prefersReducedMotion ? false : ({ scale: 0.9, opacity: 0 })}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-semibold"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary-500 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-500" />
              </span>
              {liveCount} new
            </motion.span>
          )}

          <Button variant="ghost"
            onClick={() => setIsPaused((p) => !p)}
            className={cn(
              'text-xs font-medium px-2.5 py-1 rounded-md transition-colors',
              isPaused
                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
            )}
            title={isPaused ? 'Resume live updates' : 'Pause live updates'}
          >
            {isPaused ? 'Paused' : 'Live'}
          </Button>

          <IconButton variant="default"
            onClick={handleRefresh}
            className="p-1.5 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 transition-colors"
            title="Refresh"
            aria-label="Refresh feed"
          >
            <IconRefresh size={14} />
          </IconButton>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[600px] overflow-y-auto">
        {loading ? (
          <FeedSkeleton />
        ) : events.length === 0 ? (
          <EmptyFeed />
        ) : (
          <ul className="divide-y divide-warm-100/60">
            <AnimatePresence initial={false}>
              {events.map((ev, idx) => (
                <FeedRow
                  key={ev.id}
                  event={ev}
                  isNew={idx === 0 && liveCount > 0}
                  onSelect={onSelectMessage}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------
function FeedRow({
  event,
  isNew,
  onSelect,
}: {
  event: EmailEventRow;
  isNew: boolean;
  onSelect?: (id: string) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const cfg = EVENT_CONFIG[event.event_type] ?? {
    label: event.event_type,
    color: 'text-warm-600',
    dotColor: 'bg-warm-400',
    icon: null,
  };

  // Try to pull subject / from out of raw_payload for richer display
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (event.raw_payload as any)?.data ?? {};
  const subject: string | undefined = data.subject;
  const from: string | undefined = data.from;

  return (
    <motion.li
      layout
      initial={prefersReducedMotion ? false : (isNew ? { backgroundColor: 'rgba(22, 163, 74, 0.08)' } : false)}
      animate={{ backgroundColor: 'rgba(255, 255, 255, 0)' }}
      transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 2 })}
      className={cn(
        'group relative px-6 py-3 flex items-start gap-3',
        onSelect && 'cursor-pointer hover:bg-white/70'
      )}
      onClick={() => onSelect?.(event.resend_message_id)}
    >
      {/* dot + icon column */}
      <div className="flex flex-col items-center pt-1">
        <span
          className={cn(
            'w-2 h-2 rounded-full ring-4 ring-white',
            cfg.dotColor
          )}
        />
      </div>

      {/* content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide',
              cfg.color
            )}
          >
            {cfg.icon}
            {cfg.label}
          </span>
          {event.recipient_email && (
            <span className="text-xs text-warm-700 truncate max-w-[200px]">
              {event.recipient_email}
            </span>
          )}
          {event.contact_log_id && (
            <span className="text-eyebrow font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 uppercase tracking-wide">
              CRM
            </span>
          )}
        </div>

        {subject && (
          <p className="text-sm text-warm-900 mt-0.5 truncate">{subject}</p>
        )}
        {from && !subject && (
          <p className="text-xs text-warm-500 mt-0.5 truncate">from {from}</p>
        )}

        <p
          className="text-eyebrow text-warm-400 mt-0.5 tabular-nums"
          title={formatFullTimestamp(event.occurred_at)}
        >
          {formatRelative(event.occurred_at)} · {event.resend_message_id.slice(0, 8)}
        </p>
      </div>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Skeleton / empty
// ---------------------------------------------------------------------------
function FeedSkeleton() {
  return (
    <ul className="divide-y divide-warm-100/60">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="px-6 py-3 flex items-start gap-3 animate-pulse">
          <div className="w-2 h-2 rounded-full bg-warm-200 mt-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 bg-warm-100 rounded" />
            <div className="h-3 w-3/4 bg-warm-100 rounded" />
            <div className="h-2 w-20 bg-warm-100 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyFeed() {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-center">
      <div className="p-3 rounded-full bg-warm-100 mb-3">
        <IconActivity size={20} className="text-warm-400" />
      </div>
      <p className="text-sm font-medium text-warm-700">No recent activity</p>
      <p className="text-xs text-warm-500 mt-1 max-w-xs">
        Events will appear here in real time as Resend delivers them.
      </p>
    </div>
  );
}
