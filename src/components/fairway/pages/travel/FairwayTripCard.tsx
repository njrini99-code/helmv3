'use client';

/**
 * ============================================================================
 * Fairway · Travel · FairwayTripCard — one trip in the itinerary list
 * ----------------------------------------------------------------------------
 * A matte selectable list-row (native <button> with Surface-look classes, the
 * proven TripRow pattern from hub-parts). Shows the transport icon, event name,
 * lifecycle StatusPill, destination, and date range — every data point the
 * legacy list row carried. Selecting it surfaces the trip in the detail panel.
 *
 * Presentation only. Tokens ONLY.
 * ========================================================================== */

import { MapPin, Calendar, ChevronRight } from 'lucide-react';

import { StatusPill } from '@/components/fairway';
import { Button } from '@/components/fairway/controls/button';
import { cn } from '@/lib/utils';
import {
  type TravelItinerary,
  TRANSPORT_ICON,
  getTripStatus,
  formatTravelDate,
} from './travel-helpers';

export interface FairwayTripCardProps {
  itinerary: TravelItinerary;
  selected: boolean;
  now: Date | null;
  onSelect: () => void;
}

export function FairwayTripCard({ itinerary, selected, now, onSelect }: FairwayTripCardProps) {
  const status = getTripStatus(itinerary, now);
  const Icon = TRANSPORT_ICON[itinerary.transportation_type];
  const hasReturn =
    itinerary.return_date && itinerary.return_date !== itinerary.departure_date;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group relative block h-auto min-h-0 w-full rounded-card p-4 text-left font-normal',
        'transition-[box-shadow,transform,border-color,background-color]',
        '[transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        selected
          ? 'border border-accent-300 bg-accent-50/60 shadow-soft hover:bg-accent-50/60'
          : 'border border-border-subtle bg-surface shadow-flat hover:-translate-y-px hover:border-border-strong hover:bg-surface hover:shadow-raise',
      )}
    >
      <span className="flex w-full items-start gap-3">
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-fw-md',
            selected ? 'bg-accent-100 text-accent-700' : 'bg-surface-sunken text-text-tertiary',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="block min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate font-fw-sans text-body-sm font-medium',
                selected ? 'text-accent-800' : 'text-text-primary',
              )}
            >
              {itinerary.event_name || 'Trip'}
            </span>
            <StatusPill tone={status.tone} size="sm" dot pulse={status.pulse} className="flex-shrink-0">
              {status.label}
            </StatusPill>
          </span>
          <span className="mt-1 flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
            <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{itinerary.destination || 'Destination TBD'}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary tabular-nums">
            <Calendar aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span>
              {formatTravelDate(itinerary.departure_date)}
              {hasReturn ? <> &ndash; {formatTravelDate(itinerary.return_date as string)}</> : null}
            </span>
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            selected ? 'text-accent-600' : 'text-text-tertiary',
          )}
        />
      </span>
    </Button>
  );
}
