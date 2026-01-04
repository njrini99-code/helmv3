'use client';

/**
 * RSVP Lock Indicator Component
 *
 * Countdown timer showing time remaining to RSVP:
 * - Urgent (≤60 min): Red with pulse animation
 * - Warning (≤4 hrs): Amber
 * - Normal (>4 hrs): Slate
 * - Locked state: Lock icon with message
 *
 * Features:
 * - Real-time countdown
 * - Visual urgency states
 * - Pulse animation for critical deadlines
 * - Locked state when deadline passed
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getUrgencyLevel, getUrgencyClasses } from '@/lib/calendar/premium-utils';
import { Lock, Clock, AlertTriangle } from 'lucide-react';
import { differenceInMinutes, differenceInHours, format } from 'date-fns';

export interface RSVPLockIndicatorProps {
  lockTime: string; // ISO datetime when RSVP locks
  className?: string;
  compact?: boolean;
  onLocked?: () => void;
}

interface CountdownState {
  isLocked: boolean;
  minutesRemaining: number;
  displayText: string;
  urgency: 'urgent' | 'warning' | 'normal';
}

export function RSVPLockIndicator({
  lockTime,
  className,
  compact = false,
  onLocked,
}: RSVPLockIndicatorProps) {
  const [countdown, setCountdown] = useState<CountdownState>(
    calculateCountdown(lockTime)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const newCountdown = calculateCountdown(lockTime);
      setCountdown(newCountdown);

      // Fire callback when it locks
      if (newCountdown.isLocked && !countdown.isLocked && onLocked) {
        onLocked();
      }
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [lockTime, countdown.isLocked, onLocked]);

  if (countdown.isLocked) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-slate-100 border border-slate-200',
          compact && 'px-2 py-1',
          className
        )}
      >
        <Lock className={cn('shrink-0', compact ? 'w-3 h-3' : 'w-4 h-4', 'text-slate-500')} />
        <div className="flex-1 min-w-0">
          {!compact && (
            <p className="text-xs font-medium text-slate-700">RSVP Closed</p>
          )}
          <p className={cn('text-slate-600', compact ? 'text-xs' : 'text-xs')}>
            {compact ? 'Locked' : 'RSVP window has closed'}
          </p>
        </div>
      </div>
    );
  }

  const isUrgent = countdown.urgency === 'urgent';
  const isWarning = countdown.urgency === 'warning';

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border',
        'transition-all duration-200',
        isUrgent && 'bg-rose-50 border-rose-300',
        isUrgent && 'animate-pulse',
        isWarning && 'bg-amber-50 border-amber-300',
        !isUrgent && !isWarning && 'bg-slate-50 border-slate-200',
        compact && 'px-2 py-1',
        className
      )}
    >
      {isUrgent ? (
        <AlertTriangle
          className={cn('shrink-0', compact ? 'w-3 h-3' : 'w-4 h-4', 'text-rose-600')}
        />
      ) : (
        <Clock
          className={cn(
            'shrink-0',
            compact ? 'w-3 h-3' : 'w-4 h-4',
            isWarning ? 'text-amber-600' : 'text-slate-500'
          )}
        />
      )}

      <div className="flex-1 min-w-0">
        {!compact && (
          <p
            className={cn(
              'text-xs font-medium',
              isUrgent && 'text-rose-700',
              isWarning && 'text-amber-700',
              !isUrgent && !isWarning && 'text-slate-700'
            )}
          >
            {isUrgent ? 'RSVP Closing Soon!' : 'RSVP Deadline'}
          </p>
        )}
        <p
          className={cn(
            'font-semibold tabular-nums',
            compact ? 'text-xs' : 'text-sm',
            isUrgent && 'text-rose-900',
            isWarning && 'text-amber-900',
            !isUrgent && !isWarning && 'text-slate-900'
          )}
        >
          {countdown.displayText}
        </p>
      </div>

      {/* Urgency badge */}
      {!compact && isUrgent && (
        <span className="shrink-0 px-2 py-0.5 text-xs font-bold uppercase tracking-wide rounded-full bg-rose-600 text-white">
          Urgent
        </span>
      )}
    </div>
  );
}

/**
 * Calculate countdown state
 */
function calculateCountdown(lockTime: string): CountdownState {
  const now = new Date();
  const deadline = new Date(lockTime);
  const minutesRemaining = differenceInMinutes(deadline, now);
  const hoursRemaining = differenceInHours(deadline, now);

  // Locked state
  if (minutesRemaining <= 0) {
    return {
      isLocked: true,
      minutesRemaining: 0,
      displayText: 'Locked',
      urgency: 'normal',
    };
  }

  // Determine urgency
  let urgency: 'urgent' | 'warning' | 'normal';
  if (minutesRemaining <= 60) {
    urgency = 'urgent'; // ≤1 hour
  } else if (minutesRemaining <= 240) {
    urgency = 'warning'; // ≤4 hours
  } else {
    urgency = 'normal';
  }

  // Format display text
  let displayText: string;
  if (minutesRemaining < 60) {
    // Show minutes
    displayText = `${minutesRemaining} min${minutesRemaining !== 1 ? 's' : ''} remaining`;
  } else if (hoursRemaining < 24) {
    // Show hours
    displayText = `${hoursRemaining} hr${hoursRemaining !== 1 ? 's' : ''} remaining`;
  } else {
    // Show days
    const daysRemaining = Math.floor(hoursRemaining / 24);
    displayText = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`;
  }

  return {
    isLocked: false,
    minutesRemaining,
    displayText,
    urgency,
  };
}

/**
 * Inline RSVP Lock (for event cards)
 */
export function InlineRSVPLock({
  lockTime,
  className,
}: Pick<RSVPLockIndicatorProps, 'lockTime' | 'className'>) {
  const countdown = calculateCountdown(lockTime);

  if (countdown.isLocked) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-slate-500', className)}>
        <Lock className="w-3 h-3" />
        <span>RSVP closed</span>
      </span>
    );
  }

  const isUrgent = countdown.minutesRemaining <= 60;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        isUrgent ? 'text-rose-600' : 'text-slate-600',
        className
      )}
    >
      <Clock className="w-3 h-3" />
      <span>{countdown.displayText}</span>
    </span>
  );
}

/**
 * Badge variant (minimal)
 */
export function RSVPLockBadge({ lockTime }: Pick<RSVPLockIndicatorProps, 'lockTime'>) {
  const countdown = calculateCountdown(lockTime);

  if (countdown.isLocked) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
        <Lock className="w-3 h-3" />
        Closed
      </span>
    );
  }

  const isUrgent = countdown.minutesRemaining <= 60;
  const isWarning = countdown.minutesRemaining <= 240;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        isUrgent && 'bg-rose-100 text-rose-700 animate-pulse',
        isWarning && !isUrgent && 'bg-amber-100 text-amber-700',
        !isUrgent && !isWarning && 'bg-slate-100 text-slate-600'
      )}
    >
      <Clock className="w-3 h-3" />
      {countdown.minutesRemaining < 60
        ? `${countdown.minutesRemaining}m`
        : countdown.minutesRemaining < 1440
        ? `${Math.floor(countdown.minutesRemaining / 60)}h`
        : `${Math.floor(countdown.minutesRemaining / 1440)}d`}
    </span>
  );
}
