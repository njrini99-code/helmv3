'use client';

import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { ShineEffect } from '@/components/ui/shine-effect';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  IconCalendar,
  IconClipboardList,
  IconBell,
  IconChevronRight,
  IconAlertCircle,
  IconRefresh,
} from '@/components/icons';

interface Event {
  id: string;
  title: string;
  eventType: string;
  startTime: string;
}

interface UpcomingSectionProps {
  events: Event[];
  pendingTasks: number;
  unreadMessages: number;
  loading?: boolean;
  /** Truthy when the dashboard hook failed. Renders the recoverable error face. */
  error?: boolean;
  /** Retry handler — typically the hook's `refetch`. */
  onRetry?: () => void;
}

/** A single mini-card cell used for the three-up upcoming grid. */
function MiniCard({
  index,
  prefersReducedMotion,
  children,
}: {
  index: number;
  prefersReducedMotion: boolean | null;
  children: React.ReactNode;
}) {
  return (
    <m.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: prefersReducedMotion ? 0 : index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="relative glass-standard rounded-2xl overflow-clip"
    >
      <ShineEffect />
      {children}
    </m.div>
  );
}

// Event-type dots stay on the daily-home restricted accent set: primary green
// for on-field work, amber for competitive/contested, warm-stone for everything
// administrative — no separate blue / purple / cyan categorical hues.
const eventTypeColors: Record<string, string> = {
  practice: 'bg-primary-500',
  game: 'bg-amber-500',
  scrimmage: 'bg-amber-500',
  team_meeting: 'bg-warm-500',
  travel: 'bg-warm-500',
  film_session: 'bg-warm-400',
  other: 'bg-warm-400',
};

function formatEventDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true,
  });
  
  if (isToday) return `Today ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;
  
  return date.toLocaleDateString('en-US', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function UpcomingSection({
  events,
  pendingTasks,
  unreadMessages,
  loading,
  error,
  onRetry,
}: UpcomingSectionProps) {
  const prefersReducedMotion = useReducedMotion();

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="relative glass-standard rounded-2xl overflow-clip">
            <ShineEffect />
            <div className="px-5 py-4 border-b border-warm-100/50">
              <div className="flex items-center gap-2">
                <Skeleton variant="rectangular" width={16} height={16} className="rounded" />
                <Skeleton variant="text" width={100} height={16} />
              </div>
            </div>
            <div className="p-4 space-y-3">
              {[0, 1, 2].map(j => (
                <Skeleton key={j} variant="rectangular" className="w-full h-10 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="relative glass-standard rounded-2xl overflow-clip"
      >
        <ShineEffect />
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
            <IconAlertCircle size={22} className="text-destructive" />
          </div>
          <h4 className="text-sm font-medium text-warm-900 mb-1">Couldn&apos;t load your schedule</h4>
          <p className="text-xs text-warm-500 max-w-[260px] mb-3">
            Events, tasks, and messages are temporarily unavailable. Try again in a moment.
          </p>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<IconRefresh size={14} />}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Events */}
        <MiniCard index={0} prefersReducedMotion={prefersReducedMotion}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100/50">
            <div className="flex items-center gap-2">
              <IconCalendar size={16} className="text-warm-400" aria-hidden="true" />
              <h3 className="font-semibold text-warm-900 text-sm tracking-tight">Upcoming Events</h3>
            </div>
            <Link
              href="/baseball/dashboard/calendar"
              aria-label="View all events on the calendar"
              className="text-warm-500 hover:text-warm-900 transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 group"
            >
              <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none" />
            </Link>
          </div>
          <div className="p-3">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <IconCalendar size={24} className="text-warm-300 mb-2" aria-hidden="true" />
                <p className="text-xs text-warm-500">No upcoming events</p>
              </div>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 4).map(event => (
                  <Link
                    key={event.id}
                    href={`/baseball/dashboard/calendar?event=${event.id}`}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-warm-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${eventTypeColors[event.eventType] || eventTypeColors.other}`} aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-warm-900 truncate">{event.title}</p>
                      <p className="text-xs text-warm-500">{formatEventDate(event.startTime)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </MiniCard>

        {/* Tasks */}
        <MiniCard index={1} prefersReducedMotion={prefersReducedMotion}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100/50">
            <div className="flex items-center gap-2">
              <IconClipboardList size={16} className="text-warm-400" aria-hidden="true" />
              <h3 className="font-semibold text-warm-900 text-sm tracking-tight">Tasks Due</h3>
              {pendingTasks > 0 && (
                <Badge variant="warning" className="text-eyebrow px-1.5 py-0">
                  {pendingTasks}
                </Badge>
              )}
            </div>
            <Link
              href="/baseball/dashboard/tasks"
              aria-label="View all tasks"
              className="text-warm-500 hover:text-warm-900 transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 group"
            >
              <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none" />
            </Link>
          </div>
          <div className="p-3">
            {pendingTasks === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <IconClipboardList size={24} className="text-warm-300 mb-2" aria-hidden="true" />
                <p className="text-xs text-warm-500">No pending tasks</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6">
                <p className="text-3xl font-bold text-warm-900 tabular-nums">{pendingTasks}</p>
                <p className="text-xs text-warm-500 mt-1">{pendingTasks === 1 ? 'task' : 'tasks'} pending</p>
                <Link href="/baseball/dashboard/tasks" className="mt-3">
                  <Button variant="ghost" size="sm" className="text-xs text-primary-600 hover:text-primary-700">
                    View All
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </MiniCard>

        {/* Messages */}
        <MiniCard index={2} prefersReducedMotion={prefersReducedMotion}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100/50">
            <div className="flex items-center gap-2">
              <IconBell size={16} className="text-warm-400" aria-hidden="true" />
              <h3 className="font-semibold text-warm-900 text-sm tracking-tight">Messages</h3>
              {unreadMessages > 0 && (
                <Badge variant="danger" className="text-eyebrow px-1.5 py-0">
                  {unreadMessages}
                </Badge>
              )}
            </div>
            <Link
              href="/baseball/dashboard/messages"
              aria-label="View all messages"
              className="text-warm-500 hover:text-warm-900 transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 group"
            >
              <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none" />
            </Link>
          </div>
          <div className="p-3">
            {unreadMessages === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <IconBell size={24} className="text-warm-300 mb-2" aria-hidden="true" />
                <p className="text-xs text-warm-500">All caught up</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6">
                <p className="text-3xl font-bold text-warm-900 tabular-nums">{unreadMessages}</p>
                <p className="text-xs text-warm-500 mt-1">{unreadMessages === 1 ? 'unread message' : 'unread messages'}</p>
                <Link href="/baseball/dashboard/messages" className="mt-3">
                  <Button variant="ghost" size="sm" className="text-xs text-primary-600 hover:text-primary-700">
                    View All
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </MiniCard>
      </div>
    </LazyMotion>
  );
}
