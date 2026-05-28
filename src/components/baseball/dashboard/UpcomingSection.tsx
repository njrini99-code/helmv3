'use client';

import Link from 'next/link';
import { ShineEffect } from '@/components/ui/shine-effect';
import { Skeleton } from '@/components/ui/skeleton-loader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  IconCalendar,
  IconClipboardList,
  IconBell,
  IconChevronRight,
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
}

const eventTypeColors: Record<string, string> = {
  practice: 'bg-green-500',
  game: 'bg-blue-500',
  scrimmage: 'bg-amber-500',
  team_meeting: 'bg-purple-500',
  travel: 'bg-warm-500',
  film_session: 'bg-cyan-500',
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
}: UpcomingSectionProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="relative glass-standard rounded-2xl overflow-clip">
            <ShineEffect />
            <div className="px-5 py-4 border-b border-warm-100/50">
              <div className="flex items-center gap-2">
                <Skeleton variant="rectangular" width={16} height={16} className="rounded" />
                <Skeleton variant="text" width={100} height={16} />
              </div>
            </div>
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(j => (
                <Skeleton key={j} variant="rectangular" className="w-full h-10 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Events */}
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100/50">
          <div className="flex items-center gap-2">
            <IconCalendar size={16} className="text-blue-500" />
            <h3 className="font-semibold text-warm-900 text-sm">Upcoming Events</h3>
          </div>
          <Link 
            href="/baseball/dashboard/calendar" 
            className="text-xs text-warm-500 hover:text-warm-900 transition-colors"
          >
            <IconChevronRight size={14} />
          </Link>
        </div>
        <div className="p-3">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <IconCalendar size={24} className="text-warm-300 mb-2" />
              <p className="text-xs text-warm-500">No upcoming events</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.slice(0, 4).map(event => (
                <Link 
                  key={event.id}
                  href={`/baseball/dashboard/calendar?event=${event.id}`}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-warm-50 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${eventTypeColors[event.eventType] || eventTypeColors.other}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-warm-900 truncate">{event.title}</p>
                    <p className="text-xs text-warm-500">{formatEventDate(event.startTime)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tasks */}
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100/50">
          <div className="flex items-center gap-2">
            <IconClipboardList size={16} className="text-amber-500" />
            <h3 className="font-semibold text-warm-900 text-sm">Tasks Due</h3>
            {pendingTasks > 0 && (
              <Badge variant="warning" className="text-eyebrow px-1.5 py-0">
                {pendingTasks}
              </Badge>
            )}
          </div>
          <Link 
            href="/baseball/dashboard/tasks" 
            className="text-xs text-warm-500 hover:text-warm-900 transition-colors"
          >
            <IconChevronRight size={14} />
          </Link>
        </div>
        <div className="p-3">
          {pendingTasks === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <IconClipboardList size={24} className="text-warm-300 mb-2" />
              <p className="text-xs text-warm-500">No pending tasks</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6">
              <p className="text-3xl font-bold text-warm-900 tabular-nums">{pendingTasks}</p>
              <p className="text-xs text-warm-500 mt-1">tasks pending</p>
              <Link href="/baseball/dashboard/tasks">
                <Button variant="ghost" className="mt-3 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors">
                  View All →
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100/50">
          <div className="flex items-center gap-2">
            <IconBell size={16} className="text-purple-500" />
            <h3 className="font-semibold text-warm-900 text-sm">Messages</h3>
            {unreadMessages > 0 && (
              <Badge variant="danger" className="text-eyebrow px-1.5 py-0">
                {unreadMessages}
              </Badge>
            )}
          </div>
          <Link 
            href="/baseball/dashboard/messages" 
            className="text-xs text-warm-500 hover:text-warm-900 transition-colors"
          >
            <IconChevronRight size={14} />
          </Link>
        </div>
        <div className="p-3">
          {unreadMessages === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <IconBell size={24} className="text-warm-300 mb-2" />
              <p className="text-xs text-warm-500">All caught up!</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6">
              <p className="text-3xl font-bold text-warm-900 tabular-nums">{unreadMessages}</p>
              <p className="text-xs text-warm-500 mt-1">unread messages</p>
              <Link href="/baseball/dashboard/messages">
                <Button variant="ghost" className="mt-3 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors">
                  View All →
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
