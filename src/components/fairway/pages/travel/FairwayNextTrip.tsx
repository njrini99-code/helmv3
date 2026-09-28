'use client';

/**
 * FairwayNextTrip — the next trip as a boarding pass (redesign 2026-09-28,
 * docs/redesign/travel).
 *
 * Travel has its own visual language, and a pass is the one people already
 * read without thinking: a coloured carrier band, FROM → TO, the fields in a
 * grid (date, departs, returns, stay), and a torn-off stub with the countdown.
 * Every field is real data (departure_time 87% filled, meeting point 80%,
 * hotel 60% in prod); a missing field reads "TBA" in the grid instead of a
 * sentence, the way a real pass shows an unassigned gate.
 */
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  type TravelItinerary,
  getTripStatus,
  daysUntil,
  formatWeekdayDate,
  formatTravelTime,
  transportIcon,
  transportLabel,
  mapsHref,
} from './travel-helpers';

export interface FairwayNextTripProps {
  itinerary: TravelItinerary;
  now: Date | null;
  onOpen: () => void;
}

function PassField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="font-fw-sans text-eyebrow uppercase text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 truncate font-fw-display text-h3 text-text-primary tabular-nums">{children}</dd>
    </div>
  );
}

export function FairwayNextTrip({ itinerary, now, onOpen }: FairwayNextTripProps) {
  const status = getTripStatus(itinerary, now);
  const onTheRoad = status.label === 'In transit' || status.label === 'Departed';
  const days = now ? daysUntil(itinerary.departure_date, now) : null;
  const Icon = transportIcon(itinerary.transportation_type);
  const from = itinerary.departure_location;
  const to = itinerary.destination || 'Destination TBD';
  const toShort = to.split(',')[0] ?? to;

  // The stub: a big number when there is one to show, a word otherwise.
  const stubBig = onTheRoad ? null : days === 0 ? 'Today' : days !== null && days > 0 ? String(days) : null;
  const stubUnit = onTheRoad || days === 0 ? null : days === 1 ? 'day to go' : days !== null && days > 1 ? 'days to go' : null;

  return (
    <section
      aria-labelledby="next-trip-title"
      className="relative overflow-hidden rounded-card border border-border-subtle bg-surface shadow-soft"
    >
      {/* Carrier band */}
      <div className="flex items-center justify-between gap-3 bg-accent-fill px-5 py-2.5 text-text-on-accent-fill">
        <p className="font-fw-sans text-eyebrow uppercase">{onTheRoad ? 'On the road' : 'Next trip'}</p>
        <p className="flex items-center gap-1.5 font-fw-sans text-eyebrow uppercase">
          <Icon className="h-4 w-4" aria-hidden />
          {transportLabel(itinerary.transportation_type)}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row">
        {/* Pass body */}
        <div className="min-w-0 flex-1 p-5">
          <h2 id="next-trip-title" className="break-words font-fw-sans text-body-sm font-medium text-text-secondary">
            {itinerary.event_name || 'Trip'}
          </h2>

          {/* FROM → TO */}
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="min-w-0">
              <p className="font-fw-sans text-eyebrow uppercase text-text-tertiary">From</p>
              {from ? (
                <a
                  href={mapsHref(from)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 line-clamp-2 font-fw-display text-h3 text-accent-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  {from}
                  <span className="sr-only"> (opens Maps)</span>
                </a>
              ) : (
                <p className="mt-0.5 font-fw-display text-h3 text-text-tertiary">TBA</p>
              )}
            </div>
            {/* The route: a dashed line with the vehicle riding it. */}
            <div aria-hidden className="flex w-14 items-center pb-2.5 sm:w-20">
              <span className="h-px flex-1 border-t border-dashed border-border-strong" />
              <Icon className="mx-1 h-4 w-4 text-accent-ink" />
              <span className="h-px flex-1 border-t border-dashed border-border-strong" />
            </div>
            <div className="min-w-0 text-right">
              <p className="font-fw-sans text-eyebrow uppercase text-text-tertiary">To</p>
              <p className="mt-0.5 line-clamp-2 font-fw-display text-h3 text-text-primary" title={to}>
                {toShort}
              </p>
            </div>
          </div>

          {/* The pass fields */}
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-4">
            <PassField label="Date">{formatWeekdayDate(itinerary.departure_date)}</PassField>
            <PassField label="Departs">
              {itinerary.departure_time ? formatTravelTime(itinerary.departure_time) : 'TBA'}
            </PassField>
            {/* Date + Departs always show (a missing leave time is the signal).
                Return and stay only when posted: four "TBA"s read as an empty pass. */}
            {itinerary.return_date ? (
              <PassField label="Returns">{formatWeekdayDate(itinerary.return_date)}</PassField>
            ) : null}
            {itinerary.hotel_name ? <PassField label="Stay">{itinerary.hotel_name}</PassField> : null}
            {itinerary.uniform_requirements ? (
              <div className="col-span-2 min-w-0">
                <dt className="font-fw-sans text-eyebrow uppercase text-text-tertiary">Wear</dt>
                <dd className="mt-0.5 font-fw-sans text-body-sm text-text-primary">{itinerary.uniform_requirements}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {/* Perforation: a dashed tear line with two notches cut out of the
            card. Horizontal on phones (stub below), vertical from sm. */}
        <div aria-hidden className="relative border-t border-dashed border-border-strong sm:border-l sm:border-t-0">
          <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-canvas sm:-top-2.5 sm:left-[-0.625rem]" />
          <span className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-canvas sm:-bottom-2.5 sm:left-[-0.625rem] sm:right-auto sm:top-auto" />
        </div>

        {/* Stub: the countdown */}
        <div className="flex items-center justify-between gap-4 bg-surface-sunken px-5 py-4 sm:w-44 sm:flex-col sm:items-start sm:justify-center">
          <div className="tabular-nums">
            {stubBig ? (
              <>
                <p className={cn('font-fw-display leading-none text-text-primary', stubBig.length > 3 ? 'text-h1' : 'text-stat-lg')}>
                  {stubBig}
                </p>
                {stubUnit ? (
                  <p className="mt-1.5 font-fw-sans text-eyebrow uppercase text-text-tertiary">{stubUnit}</p>
                ) : null}
              </>
            ) : (
              <p className="font-fw-display text-h2 text-accent-ink">{status.label}</p>
            )}
          </div>
          <Button variant="secondary" size="sm" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />} onClick={onOpen}>
            Trip sheet
          </Button>
        </div>
      </div>
    </section>
  );
}
