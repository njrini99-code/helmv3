'use client';

/**
 * ============================================================================
 * Fairway · Travel · FairwayTripCard — one trip in the itinerary list
 * ----------------------------------------------------------------------------
 * A selectable list row (a Fairway PressTarget with a card look): a date tile
 * for the departure day, the trip name, the destination, the dates and the
 * transport, and one status pill: the countdown for an upcoming trip ("In 22
 * days"), the day of the trip on the road ("Day 2 of 3", the one pulsing
 * green), or when a past trip came home ("Returned Aug 1").
 *
 * Status is carried by surface and ink, not colour: an upcoming trip is a
 * raised card in full ink; a trip on the road inverts its date tile; a past
 * trip recedes (no fill or shadow, secondary ink, an outlined tile). The trip
 * in the detail panel carries an ink bar and a strong edge; the default trip
 * (shown in the desktop panel before anything is picked) takes that look from
 * `lg` only, since on a phone the panel is not on screen until a pick.
 *
 * The name owns the full text column and wraps to two lines; the status pill
 * sits on its own line under the dates. PressTarget rather than Button:
 * Button's base is a nowrap pill (`whitespace-nowrap`, `rounded-full`).
 *
 * Presentation only. Tokens ONLY.
 * ========================================================================== */

import { ChevronRight } from 'lucide-react';

import { PressTarget, StatusPill } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  type TravelItinerary,
  type TripPhase,
  TRANSPORT_ICON,
  TRANSPORT_LABEL,
  dateTileParts,
  formatTravelRange,
  getTripStatus,
  tripCountdown,
  tripPhase,
} from './travel-helpers';

export interface FairwayTripCardProps {
  itinerary: TravelItinerary;
  /** Picked by the viewer: the panel shows it at every width. */
  selected: boolean;
  /** Shown in the desktop panel without being picked (the default trip). */
  shownOnDesktop?: boolean;
  now: Date | null;
  onSelect: () => void;
}

export function FairwayTripCard({
  itinerary,
  selected,
  shownOnDesktop = false,
  now,
  onSelect,
}: FairwayTripCardProps) {
  const phase: TripPhase = now ? tripPhase(itinerary, now) : 'upcoming';
  const status = getTripStatus(itinerary, now);
  // Upcoming and on-the-road trips say how far off they are; a past trip
  // says when it came home. Before `now` resolves, the calm status label.
  const pillLabel = now ? tripCountdown(itinerary, now).short : status.label;
  const Icon = TRANSPORT_ICON[itinerary.transportation_type];
  const past = phase === 'past';
  const marked = selected || shownOnDesktop;

  return (
    <PressTarget
      onClick={onSelect}
      aria-pressed={selected}
      data-trip-id={itinerary.id}
      className={cn(
        // PressTarget brings the focus ring, the 180ms transition and the
        // surface press response; the card look is ours.
        'group relative block w-full rounded-card border p-3 text-left sm:p-4',
        selected
          ? 'border-border-strong bg-surface shadow-soft'
          : past
            ? 'border-border-subtle bg-transparent'
            : 'border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]',
        !selected && shownOnDesktop && 'lg:border-border-strong lg:bg-surface lg:shadow-soft',
        'hover:-translate-y-px hover:border-border-strong hover:bg-surface hover:shadow-raise motion-reduce:hover:translate-y-0',
      )}
    >
      {marked ? (
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-text-primary',
            !selected && 'hidden lg:block',
          )}
        />
      ) : null}
      <span className="flex w-full items-start gap-3 sm:gap-4">
        <DateTile dateKey={itinerary.departure_date} phase={phase} />
        <span className="block min-w-0 flex-1">
          <span
            className={cn(
              'line-clamp-2 break-words font-fw-sans text-body font-semibold leading-snug',
              past ? 'text-text-secondary' : 'text-text-primary',
            )}
          >
            {itinerary.event_name.trim() || 'Trip'}
          </span>
          <span className="mt-0.5 block truncate font-fw-sans text-body-sm text-text-secondary">
            {itinerary.destination.trim() || 'Destination not set'}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 font-fw-sans text-caption tabular-nums text-text-secondary">
            <span>{formatTravelRange(itinerary.departure_date, itinerary.return_date)}</span>
            <span aria-hidden className="text-text-tertiary">
              ·
            </span>
            <span className="inline-flex items-center gap-1">
              <Icon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
              {TRANSPORT_LABEL[itinerary.transportation_type]}
            </span>
          </span>
          {/* Its own line: the dates plus a pill do not fit one line of the
              390px text column. */}
          <StatusPill
            tone={status.tone}
            size="sm"
            dot
            pulse={status.pulse}
            className="mt-2 flex w-fit tabular-nums"
          >
            {pillLabel}
          </StatusPill>
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            'mt-1 h-4 w-4 shrink-0 transition-transform [transition-duration:180ms] group-hover:translate-x-0.5 motion-reduce:transition-none',
            marked ? 'text-text-primary' : 'text-text-tertiary',
          )}
        />
      </span>
    </PressTarget>
  );
}

/**
 * The departure day as a calendar tile: month, day, weekday. Sunken for an
 * upcoming trip, inverted ink for the trip on the road, outlined for a past one.
 */
function DateTile({ dateKey, phase }: { dateKey: string; phase: TripPhase }) {
  const parts = dateTileParts(dateKey);
  const live = phase === 'on_the_road';
  const past = phase === 'past';
  return (
    <span
      aria-hidden
      className={cn(
        'flex w-14 shrink-0 flex-col items-center rounded-fw-md border py-1.5 font-fw-sans',
        live
          ? 'border-transparent bg-text-primary'
          : past
            ? 'border-border-subtle bg-transparent'
            : 'border-border-subtle bg-surface-sunken',
      )}
    >
      <span
        className={cn(
          'text-microlabel font-semibold uppercase tracking-[0.08em]',
          live ? 'text-surface' : past ? 'text-text-tertiary' : 'text-text-secondary',
        )}
      >
        {parts?.month ?? '—'}
      </span>
      <span
        className={cn(
          'text-h2 font-semibold leading-7 tabular-nums',
          live ? 'text-surface' : past ? 'text-text-secondary' : 'text-text-primary',
        )}
      >
        {parts?.day ?? '—'}
      </span>
      <span className={cn('text-caption', live ? 'text-surface' : 'text-text-tertiary')}>
        {parts?.weekday ?? ''}
      </span>
    </span>
  );
}
