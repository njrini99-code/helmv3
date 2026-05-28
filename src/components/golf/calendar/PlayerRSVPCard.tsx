'use client';

/**
 * Player RSVP Card Component - Premium UI
 *
 * Response interface for players to RSVP to events:
 * - Event header with type badge
 * - Large tap targets (≥52px) for mobile
 * - Going / Maybe / Can't Go buttons in 3-column grid
 * - Selected state with scale effect
 * - Lock indicator with countdown
 * - Confirmation feedback
 *
 * Optimized for on-the-go mobile RSVP.
 */

import { useState } from 'react';
import { m, AnimatePresence, LazyMotion, domAnimation, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/calendar/premium-utils';
import { StatusBadge, type StatusBadgeProps } from './StatusBadge';
import { RSVPLockIndicator, InlineRSVPLock } from './RSVPLockIndicator';
import {
  CheckCircle2,
  HelpCircle,
  XCircle,
  Calendar,
  Clock,
  MapPin,
} from 'lucide-react';
import { format } from 'date-fns';
import '@/styles/calendar-tokens.css';
import { Button } from '@/components/ui/button';

interface PlayerRSVPCardProps {
  event: {
    id: string;
    title: string;
    event_type: string;
    status: string;
    start_date: string;
    start_time: string | null;
    end_date?: string | null;
    end_time?: string | null;
    location?: string | null;
    description?: string | null;
    rsvp_deadline?: string | null;
  };
  currentResponse?: 'accepted' | 'tentative' | 'declined' | null;
  onRespond: (response: 'accepted' | 'tentative' | 'declined') => Promise<void>;
  className?: string;
  compact?: boolean;
}

type RSVPOption = 'accepted' | 'tentative' | 'declined';

const RSVP_OPTIONS: Array<{
  value: RSVPOption;
  label: string;
  shortLabel: string;
  icon: typeof CheckCircle2;
  colorClass: string;
  bgClass: string;
  hoverClass: string;
  selectedClass: string;
}> = [
  {
    value: 'accepted',
    label: "I'm Going",
    shortLabel: 'Going',
    icon: CheckCircle2,
    colorClass: 'text-primary-700',
    bgClass: 'bg-primary-50',
    hoverClass: 'hover:bg-primary-100',
    selectedClass: 'bg-primary-600 text-white ring-4 ring-primary-200 shadow-lg',
  },
  {
    value: 'tentative',
    label: 'Maybe',
    shortLabel: 'Maybe',
    icon: HelpCircle,
    colorClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    hoverClass: 'hover:bg-amber-100',
    selectedClass: 'bg-amber-500 text-white ring-4 ring-amber-200 shadow-lg',
  },
  {
    value: 'declined',
    label: "Can't Go",
    shortLabel: "Can't",
    icon: XCircle,
    colorClass: 'text-rose-700',
    bgClass: 'bg-rose-50',
    hoverClass: 'hover:bg-rose-100',
    selectedClass: 'bg-rose-500 text-white ring-4 ring-rose-200 shadow-lg',
  },
];

export function PlayerRSVPCard({
  event,
  currentResponse,
  onRespond,
  className,
  compact = false,
}: PlayerRSVPCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [selectedResponse, setSelectedResponse] = useState<RSVPOption | null>(
    currentResponse || null
  );
  const [loading, setLoading] = useState(false);

  const eventDate = new Date(event.start_date);
  const startTime = event.start_time
    || (event.start_date.includes('T') ? event.start_date.split('T')[1]?.slice(0, 5) ?? null : null);
  const endTime = event.end_time
    || (event.end_date && event.end_date.includes('T') ? event.end_date.split('T')[1]?.slice(0, 5) ?? null : null);
  const isLocked = event.rsvp_deadline
    ? new Date(event.rsvp_deadline) < new Date()
    : false;

  async function handleRespond(response: RSVPOption) {
    if (isLocked || loading) return;

    setLoading(true);
    try {
      await onRespond(response);
      setSelectedResponse(response);
    } catch {
      // RSVP submission failed - UI will show previous state
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-warm-200 shadow-sm overflow-hidden',
        'hover:shadow-md transition-all duration-200',
        className
      )}
    >
      {/* Event header */}
      <div className={cn('p-5 border-b border-warm-200', compact && 'p-4')}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3
              className={cn(
                'font-medium text-warm-900 mb-1.5',
                compact ? 'text-base' : 'text-lg'
              )}
            >
              {event.title}
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={event.status as StatusBadgeProps['status']} size="sm" />
              <span className="text-xs text-warm-500 uppercase tracking-wide font-medium">
                {event.event_type.replace('_', ' ')}
              </span>
            </div>
          </div>

          {event.rsvp_deadline && !isLocked && (
            <InlineRSVPLock lockTime={event.rsvp_deadline} />
          )}
        </div>

        {/* Event details */}
        <div className="space-y-2 mt-3">
          <div className="flex items-center gap-2.5 text-sm text-warm-700">
            <Calendar className="w-4 h-4 text-warm-400 shrink-0" />
            <span className="font-medium">{format(eventDate, 'EEEE, MMMM d, yyyy')}</span>
          </div>
          {startTime && (
            <div className="flex items-center gap-2.5 text-sm text-warm-700">
              <Clock className="w-4 h-4 text-warm-400 shrink-0" />
              <span>
                {formatTime(startTime)}
                {endTime && ` - ${formatTime(endTime)}`}
              </span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2.5 text-sm text-warm-700">
              <MapPin className="w-4 h-4 text-warm-400 shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>

        {/* Description (non-compact only) */}
        {!compact && event.description && (
          <div className="mt-3 p-3 bg-warm-50 rounded-lg">
            <p className="text-sm text-warm-600 line-clamp-2">{event.description}</p>
          </div>
        )}
      </div>

      {/* RSVP options */}
      <div className={cn('p-5', compact && 'p-4')}>
        {isLocked ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
              <XCircle className="w-6 h-6 text-warm-400" />
            </div>
            <p className="text-sm font-medium text-warm-700 mb-1">RSVP Window Closed</p>
            <p className="text-xs text-warm-500">
              You can no longer change your response
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-warm-700 mb-4">
              Will you attend this event?
            </p>

            {/* Large tap target buttons (≥52px) */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {RSVP_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedResponse === option.value;
                const isCurrentSelection = currentResponse === option.value;

                return (
                  <Button variant="ghost"
                    key={option.value}
                    type="button"
                    onClick={() => handleRespond(option.value)}
                    disabled={loading}
                    className={cn(
                      // Base styles
                      'relative flex flex-col items-center justify-center gap-2',
                      'min-h-[88px] p-4 rounded-xl border-2',
                      'transition-all duration-200',
                      'active:scale-95',
                      // Touch-friendly (≥52px tap target exceeded with 88px height)
                      'touch-manipulation',
                      // Default state
                      option.bgClass,
                      option.hoverClass,
                      'border-transparent',
                      // Selected state with scale effect
                      isSelected && option.selectedClass,
                      isSelected && 'scale-105',
                      // Loading state
                      loading && 'opacity-50 cursor-not-allowed',
                      // Focus ring for accessibility
                      'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2',
                      isSelected
                        ? 'focus-visible:ring-white'
                        : 'focus-visible:ring-warm-300'
                    )}
                  >
                    <Icon
                      className={cn(
                        'shrink-0',
                        compact ? 'w-6 h-6' : 'w-7 h-7',
                        isSelected ? 'text-white' : option.colorClass,
                        'transition-transform',
                        isSelected && 'scale-110'
                      )}
                    />
                    <span
                      className={cn(
                        'text-eyebrow font-medium text-center uppercase tracking-wide',
                        isSelected ? 'text-white' : option.colorClass
                      )}
                    >
                      {compact ? option.shortLabel : option.label}
                    </span>

                    {/* Current response indicator */}
                    {isCurrentSelection && !isSelected && (
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-warm-600 flex items-center justify-center shadow-md">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </Button>
                );
              })}
            </div>

            {/* Lock countdown */}
            {event.rsvp_deadline && (
              <div className="mt-4">
                <RSVPLockIndicator lockTime={event.rsvp_deadline} compact />
              </div>
            )}

            {/* Confirmation message */}
            <LazyMotion features={domAnimation}>
              <AnimatePresence>
                {selectedResponse && (
                  <m.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.25, ease: [0.16, 1, 0.3, 1] })}
                    className="mt-4 p-3.5 bg-primary-50 border border-primary-200 rounded-lg"
                  >
                    <p className="text-sm text-primary-800 text-center font-medium">
                      ✓ Response saved! You can change this anytime before the deadline.
                    </p>
                  </m.div>
                )}
              </AnimatePresence>
            </LazyMotion>
          </>
        )}
      </div>
    </div>
  );
}

