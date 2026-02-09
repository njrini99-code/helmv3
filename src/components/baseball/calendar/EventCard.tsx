'use client';

import { MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEventTypeConfig, formatEventTime } from './event-type-config';

export interface BaseballEventCardProps {
  id: string;
  title: string;
  eventType: string;
  startTime: string | null;
  endTime?: string | null;
  location?: string | null;
  isMandatory?: boolean;
  rsvpGoingCount?: number;
  rsvpMaybeCount?: number;
  compact?: boolean;
  onClick?: () => void;
}

export function BaseballEventCard({
  title,
  eventType,
  startTime,
  location,
  isMandatory,
  rsvpGoingCount,
  rsvpMaybeCount,
  compact = false,
  onClick,
}: BaseballEventCardProps) {
  const config = getEventTypeConfig(eventType);
  const Icon = config.icon;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full rounded-lg overflow-hidden text-left px-2 py-1',
          'border-l-[3px]',
          'transition-all duration-200',
          'hover:scale-[1.02] hover:shadow-md hover:z-10',
          'backdrop-blur-sm',
          'shadow-[0_1px_4px_rgba(0,0,0,0.04)]',
          'cursor-pointer',
          config.bgColor,
          config.borderColor,
          config.textColor,
        )}
      >
        <p className="font-semibold text-xs truncate leading-tight">{title}</p>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-xl overflow-hidden text-left p-4',
        'border-l-[4px]',
        'transition-all duration-200',
        'hover:shadow-md hover:scale-[1.005]',
        'bg-white/70 backdrop-blur-sm',
        'border border-slate-100',
        'cursor-pointer',
        config.borderColor,
      )}
    >
      <div className="flex items-start gap-3">
        {/* Event type icon */}
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            config.bgColor,
          )}
        >
          <Icon className={cn('w-4 h-4', config.textColor)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-sm text-slate-900 truncate">{title}</p>
            {isMandatory && (
              <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-600 uppercase">
                Required
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 font-medium">
            {formatEventTime(startTime)}
          </p>

          {location && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{location}</span>
            </p>
          )}

          {/* RSVP summary */}
          {(rsvpGoingCount !== undefined && rsvpGoingCount > 0) ||
          (rsvpMaybeCount !== undefined && rsvpMaybeCount > 0) ? (
            <div className="flex items-center gap-2 mt-2">
              <Users className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500">
                {rsvpGoingCount || 0} going
                {rsvpMaybeCount ? `, ${rsvpMaybeCount} maybe` : ''}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
