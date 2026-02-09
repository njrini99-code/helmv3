'use client';

/**
 * Player Attendance Row Component
 *
 * Individual check-in interface for coaches:
 * - Avatar with RSVP indicator dot
 * - Name + RSVP status label
 * - 48px × 48px check/X buttons (touch-friendly)
 * - Selected state with color + shadow
 * - Quick toggle functionality
 *
 * Optimized for mobile workstation at events.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Check, X, AlertCircle } from 'lucide-react';
import '@/styles/calendar-tokens.css';

export interface PlayerAttendanceRowProps {
  player: {
    id: string;
    name: string;
    avatar_url?: string | null;
    rsvp_status?: 'accepted' | 'tentative' | 'declined' | 'pending';
  };
  attendance: 'present' | 'absent' | 'excused' | null;
  onMarkPresent: () => void;
  onMarkAbsent: () => void;
  className?: string;
  disabled?: boolean;
}

const RSVP_INDICATOR_COLORS = {
  accepted: 'bg-emerald-500',
  tentative: 'bg-amber-500',
  declined: 'bg-rose-400',
  pending: 'bg-warm-300',
};

const RSVP_LABELS = {
  accepted: 'Going',
  tentative: 'Maybe',
  declined: "Can't Go",
  pending: 'No Response',
};

export function PlayerAttendanceRow({
  player,
  attendance,
  onMarkPresent,
  onMarkAbsent,
  className,
  disabled = false,
}: PlayerAttendanceRowProps) {
  const [loading, setLoading] = useState(false);

  async function handleMarkPresent() {
    if (disabled || loading) return;
    setLoading(true);
    try {
      await onMarkPresent();
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkAbsent() {
    if (disabled || loading) return;
    setLoading(true);
    try {
      await onMarkAbsent();
    } finally {
      setLoading(false);
    }
  }

  const isPresent = attendance === 'present';
  const isAbsent = attendance === 'absent' || attendance === 'excused';
  const isExcused = attendance === 'excused';

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 bg-white rounded-xl border border-warm-200',
        'transition-all duration-200',
        isPresent && 'bg-emerald-50 border-emerald-200',
        isAbsent && !isExcused && 'bg-rose-50 border-rose-200',
        isExcused && 'bg-amber-50 border-amber-200',
        disabled && 'opacity-50',
        className
      )}
    >
      {/* Avatar with RSVP indicator */}
      <div className="relative shrink-0">
        {player.avatar_url ? (
          <img
            src={player.avatar_url}
            alt={player.name}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-warm-200 flex items-center justify-center text-warm-600 font-semibold text-sm">
            {player.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>
        )}

        {/* RSVP indicator dot */}
        {player.rsvp_status && (
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white',
              RSVP_INDICATOR_COLORS[player.rsvp_status]
            )}
            title={RSVP_LABELS[player.rsvp_status]}
          />
        )}
      </div>

      {/* Name and RSVP status */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-warm-900 truncate">{player.name}</p>
        {player.rsvp_status && (
          <p className="text-xs text-warm-500 mt-0.5">
            RSVP: {RSVP_LABELS[player.rsvp_status]}
          </p>
        )}
      </div>

      {/* Attendance status indicator (if already marked) */}
      {attendance && (
        <div className="shrink-0">
          {isPresent && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
              <Check className="w-3 h-3" />
              Present
            </span>
          )}
          {isAbsent && !isExcused && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-medium">
              <X className="w-3 h-3" />
              Absent
            </span>
          )}
          {isExcused && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              <AlertCircle className="w-3 h-3" />
              Excused
            </span>
          )}
        </div>
      )}

      {/* Check/X buttons (≥48px tap targets) */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Present button */}
        <button
          type="button"
          onClick={handleMarkPresent}
          disabled={disabled || loading}
          className={cn(
            'min-w-[52px] min-h-[52px] rounded-xl flex items-center justify-center',
            'transition-all duration-200',
            'touch-manipulation',
            'active:scale-95',
            isPresent
              ? 'bg-emerald-600 text-white shadow-lg ring-4 ring-emerald-200'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-2 border-emerald-200',
            disabled && 'cursor-not-allowed',
            loading && 'opacity-50'
          )}
          title="Mark present"
        >
          <Check className={cn('shrink-0', isPresent ? 'w-6 h-6' : 'w-5 h-5')} />
        </button>

        {/* Absent button */}
        <button
          type="button"
          onClick={handleMarkAbsent}
          disabled={disabled || loading}
          className={cn(
            'min-w-[52px] min-h-[52px] rounded-xl flex items-center justify-center',
            'transition-all duration-200',
            'touch-manipulation',
            'active:scale-95',
            isAbsent
              ? 'bg-rose-500 text-white shadow-lg ring-4 ring-rose-200'
              : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-2 border-rose-200',
            disabled && 'cursor-not-allowed',
            loading && 'opacity-50'
          )}
          title="Mark absent"
        >
          <X className={cn('shrink-0', isAbsent ? 'w-6 h-6' : 'w-5 h-5')} />
        </button>
      </div>
    </div>
  );
}

/**
 * Compact Attendance Row (for lists with many players)
 */
export function CompactPlayerAttendanceRow({
  player,
  attendance,
  onMarkPresent,
  onMarkAbsent,
}: Omit<PlayerAttendanceRowProps, 'className' | 'disabled'>) {
  const isPresent = attendance === 'present';
  const isAbsent = attendance === 'absent' || attendance === 'excused';

  return (
    <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-warm-200">
      {/* Avatar (smaller) */}
      <div className="relative shrink-0">
        {player.avatar_url ? (
          <img
            src={player.avatar_url}
            alt={player.name}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-warm-200 flex items-center justify-center text-warm-600 font-medium text-xs">
            {player.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>
        )}

        {player.rsvp_status && (
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-white',
              RSVP_INDICATOR_COLORS[player.rsvp_status]
            )}
          />
        )}
      </div>

      {/* Name */}
      <p className="flex-1 min-w-0 text-sm font-medium text-warm-900 truncate">
        {player.name}
      </p>

      {/* Compact buttons (44px minimum) */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onMarkPresent}
          className={cn(
            'min-w-[44px] min-h-[44px] p-2 rounded-lg',
            'transition-all active:scale-95',
            isPresent
              ? 'bg-emerald-600 text-white'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          )}
          title="Present"
        >
          <Check className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onMarkAbsent}
          className={cn(
            'min-w-[44px] min-h-[44px] p-2 rounded-lg',
            'transition-all active:scale-95',
            isAbsent
              ? 'bg-rose-500 text-white'
              : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
          )}
          title="Absent"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
