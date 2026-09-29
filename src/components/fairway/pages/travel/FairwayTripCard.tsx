'use client';

/**
 * ============================================================================
 * Fairway · Travel · FairwayTripCard — one trip in the itinerary list
 * ----------------------------------------------------------------------------
 * A matte selectable list-row (a Fairway PressTarget with Surface-look
 * classes). A date block (month / day) leads, like a tee sheet; then the event
 * name, the leave time + destination, and the lifecycle StatusPill.
 * Redesign 2026-09-28 (docs/redesign/travel): the transport-icon plaque was
 * replaced by the date, which is the thing people scan a trip list by.
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

import { ChevronRight } from 'lucide-react';

import { PressTarget, StatusPill } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  type TravelItinerary,
  getTripStatus,
  formatTravelDate,
  formatTravelTime,
  dateParts,
} from './travel-helpers';

export interface FairwayTripCardProps {
  itinerary: TravelItinerary;
  selected: boolean;
  now: Date | null;
  onSelect: () => void;
}

export function FairwayTripCard({ itinerary, selected, now, onSelect }: FairwayTripCardProps) {
  const status = getTripStatus(itinerary, now);
  const { month, day } = dateParts(itinerary.departure_date);
  const hasReturn =
    itinerary.return_date && itinerary.return_date !== itinerary.departure_date;
  const time = itinerary.departure_time ? formatTravelTime(itinerary.departure_time) : null;

  return (
    <PressTarget
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        // PressTarget brings the focus ring, the 180ms transition and the
        // surface press response; the row look is ours.
        'group relative block w-full rounded-card p-4 text-left',
        selected
          ? 'border border-border-control bg-accent-wash'
          : 'border border-border-subtle bg-surface hover:border-border-strong',
      )}
    >
      <span className="flex w-full items-start gap-4">
        {/* Date block: the scan key for a list of trips. */}
        <span className="flex w-10 shrink-0 flex-col items-center pt-0.5 tabular-nums" aria-hidden>
          <span className="font-fw-sans text-caption font-medium text-text-tertiary">{month}</span>
          <span className="font-fw-display text-h3 text-text-primary">{day}</span>
        </span>
        <span className="block min-w-0 flex-1">
          <span
            className={cn(
              'line-clamp-2 break-words font-fw-sans text-body font-medium',
              selected ? 'text-accent-ink' : 'text-text-primary',
            )}
          >
            {itinerary.event_name || 'Trip'}
          </span>
          <span className="mt-0.5 block truncate font-fw-sans text-body-sm text-text-secondary tabular-nums">
            {time ? <>{time} &middot; </> : null}
            {itinerary.destination || 'Destination TBD'}
          </span>
          {/* The date block is aria-hidden, so the full date is always in the
              accessible name; visually it only adds a line for a multi-day trip. */}
          <span className={cn('block font-fw-sans text-body-sm text-text-tertiary tabular-nums', !hasReturn && 'sr-only')}>
            {formatTravelDate(itinerary.departure_date)}
            {hasReturn ? <> &ndash; {formatTravelDate(itinerary.return_date as string)}</> : null}
          </span>
          {/* Only when it adds something the section heading doesn't already say
              ("Coming up" / "Past trips"): a countdown, Today, In transit. Its own
              line under the dates, so the name keeps the full column. */}
          {status.label !== 'Upcoming' && status.label !== 'Completed' ? (
            <StatusPill tone={status.tone} size="sm" dot pulse={status.pulse} className="mt-2 flex w-fit">
              {status.label}
            </StatusPill>
          ) : null}
        </span>
        <ChevronRight
          aria-hidden
          className={cn('mt-1 h-4 w-4 shrink-0', selected ? 'text-accent-ink' : 'text-text-tertiary')}
        />
      </span>
    </PressTarget>
  );
}
