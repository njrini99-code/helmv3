'use client';

/**
 * ============================================================================
 * Fairway · Travel · FairwayTripCard — one trip in the itinerary list
 * ----------------------------------------------------------------------------
 * A matte selectable list-row (a Fairway PressTarget with Surface-look
 * classes). Shows the transport icon, event name, destination, date range and
 * lifecycle StatusPill — every data point the legacy list row carried.
 * Selecting it surfaces the trip in the detail panel.
 *
 * The name owns the full text column and wraps to two lines; the status pill
 * sits on its own line under the dates. At 390px the pill beside the name
 * left it a few characters before the ellipsis. PressTarget rather than
 * Button: Button's base is a nowrap pill (`whitespace-nowrap`,
 * `rounded-full`), which kept the name on one line and rounded the card into
 * a capsule.
 *
 * Presentation only. Tokens ONLY.
 * ========================================================================== */

import { MapPin, Calendar, ChevronRight } from 'lucide-react';

import { PressTarget, StatusPill } from '@/components/fairway';
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
    <PressTarget
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        // PressTarget brings the focus ring, the 180ms transition and the
        // surface press response; the card look is ours.
        'group relative block w-full rounded-card p-4 text-left',
        'motion-reduce:hover:translate-y-0',
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
          <span
            className={cn(
              'line-clamp-2 break-words font-fw-sans text-body-sm font-medium',
              selected ? 'text-fw-success-ink' : 'text-text-primary',
            )}
          >
            {itinerary.event_name || 'Trip'}
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
          {/* Its own line: "Aug 28, 2026 – Sep 12, 2026" plus a pill does not
              fit one line of the 390px text column. */}
          <StatusPill tone={status.tone} size="sm" dot pulse={status.pulse} className="mt-2 flex w-fit">
            {status.label}
          </StatusPill>
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            selected ? 'text-accent-ink' : 'text-text-tertiary',
          )}
        />
      </span>
    </PressTarget>
  );
}
