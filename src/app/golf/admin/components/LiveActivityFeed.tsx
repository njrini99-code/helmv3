'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventType = 'signup' | 'round' | 'insight' | 'error' | 'login' | 'feature';

export interface ActivityEvent {
  id: string;
  type: EventType;
  title: string;
  message?: string;
  timestamp: Date;
  userId?: string;
  userEmail?: string;
  metadata?: Record<string, unknown>;
}

export interface LiveActivityFeedProps {
  events: ActivityEvent[];
  maxEvents?: number;
  onEventClick?: (event: ActivityEvent) => void;
  onLoadMore?: () => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

// ---------------------------------------------------------------------------
// Event Type Config
// ---------------------------------------------------------------------------

const eventTypeConfig: Record<EventType, {
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  signup: {
    icon: '👤',
    color: 'text-primary-600',
    bgColor: 'bg-primary-50',
    borderColor: 'border-primary-200',
  },
  round: {
    icon: '⛳',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  insight: {
    icon: '💡',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
  },
  error: {
    icon: '⚠️',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  login: {
    icon: '🔑',
    color: 'text-warm-600',
    bgColor: 'bg-warm-50',
    borderColor: 'border-warm-200',
  },
  feature: {
    icon: '✨',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
};

// ---------------------------------------------------------------------------
// Relative Time Helper
// ---------------------------------------------------------------------------

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Activity Event Item
// ---------------------------------------------------------------------------

function ActivityEventItem({
  event,
  onClick,
  isNew,
}: {
  event: ActivityEvent;
  onClick?: () => void;
  isNew?: boolean;
}) {
  const config = eventTypeConfig[event.type];

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: -20, scale: 0.95 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl border transition-all duration-200',
        'bg-white/60 hover:bg-white/90',
        config.borderColor,
        onClick && 'cursor-pointer hover:shadow-sm'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg',
          config.bgColor
        )}
      >
        {config.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-medium truncate', config.color)}>
            {event.title}
          </p>
          <span className="text-micro text-warm-400 tabular-nums whitespace-nowrap mt-0.5">
            {getRelativeTime(event.timestamp)}
          </span>
        </div>
        
        {event.message && (
          <p className="text-sm text-warm-600 mt-0.5 line-clamp-2">{event.message}</p>
        )}
        
        {event.userEmail && (
          <p className="text-xs text-warm-400 mt-1 truncate">
            {event.userEmail}
          </p>
        )}
      </div>

      {/* New indicator */}
      {isNew && (
        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// LiveActivityFeed Component
// ---------------------------------------------------------------------------

export function LiveActivityFeed({
  events,
  maxEvents = 50,
  onEventClick,
  onLoadMore,
  isLoading,
  emptyMessage = 'No activity yet',
}: LiveActivityFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const [newEventsCount, setNewEventsCount] = useState(0);
  const previousEventsRef = useRef<string[]>([]);

  // Track new events
  useEffect(() => {
    const currentIds = events.slice(0, maxEvents).map((e) => e.id);
    const previousIds = previousEventsRef.current;
    
    if (previousIds.length > 0) {
      const newIds = currentIds.filter((id) => !previousIds.includes(id));
      if (newIds.length > 0 && isScrolledDown) {
        setNewEventsCount((prev) => prev + newIds.length);
      }
    }
    
    previousEventsRef.current = currentIds;
  }, [events, maxEvents, isScrolledDown]);

  // Scroll detection
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop } = containerRef.current;
    setIsScrolledDown(scrollTop > 100);
    
    if (scrollTop === 0) {
      setNewEventsCount(0);
    }
  }, []);

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setNewEventsCount(0);
  };

  const displayedEvents = events.slice(0, maxEvents);

  return (
    <div className="relative glass-standard rounded-2xl overflow-clip">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100/80">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
          </span>
          <h3 className="text-sm font-semibold text-warm-900">Live Activity</h3>
          <span className="text-xs text-warm-400 tabular-nums">
            ({displayedEvents.length})
          </span>
        </div>
        
        {isLoading && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        )}
      </div>

      {/* New events banner */}
      <AnimatePresence>
        {newEventsCount > 0 && isScrolledDown && (
          <motion.button
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            onClick={scrollToTop}
            className={cn(
              'absolute top-14 left-1/2 -translate-x-1/2 z-10',
              'flex items-center gap-2 px-4 py-2 rounded-full',
              'bg-primary-500 text-white text-sm font-medium shadow-lg',
              'hover:bg-primary-600 transition-colors'
            )}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            {newEventsCount} new event{newEventsCount !== 1 ? 's' : ''}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Events list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto max-h-[500px] p-4 space-y-2"
      >
        {displayedEvents.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-sm text-warm-500">{emptyMessage}</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {displayedEvents.map((event, index) => (
              <ActivityEventItem
                key={event.id}
                event={event}
                onClick={onEventClick ? () => onEventClick(event) : undefined}
                isNew={index === 0 && !isScrolledDown}
              />
            ))}
          </AnimatePresence>
        )}

        {/* Load more */}
        {onLoadMore && events.length >= maxEvents && (
          <button
            onClick={onLoadMore}
            className={cn(
              'w-full py-3 text-sm font-medium text-warm-500',
              'hover:text-warm-700 hover:bg-warm-50 active:bg-warm-100 rounded-xl transition-colors'
            )}
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}

export default LiveActivityFeed;
