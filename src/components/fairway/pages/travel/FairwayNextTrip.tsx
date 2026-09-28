'use client';

/**
 * FairwayNextTrip — the "when and where do we leave" answer at the top of
 * Travel (redesign 2026-09-28, docs/redesign/travel).
 *
 * The probe behind it: coaches fill in departure time (87%), meeting point
 * (80%), uniform (80%) and hotel (60%), so the hero is built from exactly
 * those. Every line is optional and simply omitted when the coach hasn't
 * posted it; a trip with only a date still reads as a complete sentence.
 */
import { ArrowRight } from 'lucide-react';

import { Surface, Button, StatusPill } from '@/components/fairway';
import {
  type TravelItinerary,
  getTripStatus,
  daysUntil,
  countdownLabel,
  formatWeekdayDate,
  formatTravelTime,
  transportLabel,
  mapsHref,
} from './travel-helpers';

export interface FairwayNextTripProps {
  itinerary: TravelItinerary;
  now: Date | null;
  onOpen: () => void;
}

export function FairwayNextTrip({ itinerary, now, onOpen }: FairwayNextTripProps) {
  const status = getTripStatus(itinerary, now);
  const onTheRoad = status.label === 'In transit' || status.label === 'Departed';
  const days = now ? daysUntil(itinerary.departure_date, now) : null;
  const lead = onTheRoad ? status.label : days !== null && days >= 0 ? countdownLabel(days) : null;
  const leadTone = status.label === 'Upcoming' ? 'neutral' : status.tone;
  const time = itinerary.departure_time ? formatTravelTime(itinerary.departure_time) : null;
  const place = itinerary.departure_location;

  return (
    <Surface as="section" aria-labelledby="next-trip-title" padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-fw-sans text-eyebrow uppercase text-accent-ink">
            {onTheRoad ? 'Current trip' : 'Next trip'}
          </p>
          {lead ? (
            <StatusPill tone={leadTone} size="sm" dot={false}>
              {lead}
            </StatusPill>
          ) : null}
        </div>

        <div>
          <h2 id="next-trip-title" className="break-words font-fw-display text-h3 text-text-primary">
            {itinerary.event_name || 'Trip'}
          </h2>
          <p className="mt-0.5 font-fw-sans text-body-sm text-text-secondary">
            {transportLabel(itinerary.transportation_type)} to {itinerary.destination || 'destination TBD'}
          </p>
        </div>

        {/* The departure: the one thing people open this page for. */}
        <div>
          {/* With a leave time: date above, time as the big line. Without one,
              the date becomes the big line and the gap is said quietly, never
              in headline type. */}
          {time ? (
            <>
              <p className="font-fw-sans text-body-sm text-text-secondary tabular-nums">
                {formatWeekdayDate(itinerary.departure_date)}
              </p>
              <p className="font-fw-display text-h2 text-text-primary tabular-nums">{time}</p>
            </>
          ) : (
            <>
              <p className="font-fw-display text-h2 text-text-primary tabular-nums">
                {formatWeekdayDate(itinerary.departure_date)}
              </p>
              <p className="font-fw-sans text-body-sm text-text-secondary">Leave time not posted yet</p>
            </>
          )}
          {place ? (
            <a
              href={mapsHref(place)}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex min-h-11 items-center gap-1 font-fw-sans text-body text-accent-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {place}
              <span className="sr-only"> (opens Maps)</span>
            </a>
          ) : null}
        </div>

        {itinerary.uniform_requirements || itinerary.hotel_name ? (
          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-2 border-t border-border-subtle pt-4 font-fw-sans text-body-sm">
            {itinerary.uniform_requirements ? (
              <>
                <dt className="text-text-tertiary">Wear</dt>
                <dd className="text-text-primary">{itinerary.uniform_requirements}</dd>
              </>
            ) : null}
            {itinerary.hotel_name ? (
              <>
                <dt className="text-text-tertiary">Stay</dt>
                <dd className="text-text-primary">{itinerary.hotel_name}</dd>
              </>
            ) : null}
          </dl>
        ) : null}

        <div>
          <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />} onClick={onOpen}>
            Open trip sheet
          </Button>
        </div>
      </div>
    </Surface>
  );
}
