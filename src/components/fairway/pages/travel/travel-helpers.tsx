/**
 * ============================================================================
 * Fairway · pages/travel · travel-helpers  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * Shared types + presentation helpers for the Fairway Travel surface. PURE
 * presentation — no data fetching, no writes. The `TravelItinerary` shape is
 * IDENTICAL to the legacy TravelClient prop shape (verbatim), so the page can
 * pass the same mapped rows to either branch.
 *
 * Tokens / Fairway StatusPill tones ONLY (no legacy warm / blue / amber
 * classes). The trip-status predicate mirrors the legacy getTripStatus logic
 * exactly — only the visual tone vocabulary changes (Fairway StatusPill tones).
 * ========================================================================== */

import { Plane, Bus, Car, Truck, Route } from 'lucide-react';
import type { ComponentType } from 'react';
import type { FwStatusTone } from '@/components/fairway/controls';

/* ───────────────────────────────────────────────────────────────────────────
 * Data shape — verbatim from the legacy TravelClient props. The page maps the
 * golf_travel_itineraries rows into this exact shape for BOTH branches.
 * ────────────────────────────────────────────────────────────────────────── */
export interface TravelItinerary {
  id: string;
  /**
   * Optional link to a golf_events row. Round-tripped from the DB so the
   * create/edit picker prefills on re-edit (no silent un-linking) and the
   * detail panel can surface the linked event. Null = unlinked.
   */
  event_id: string | null;
  /**
   * Resolved title of the linked golf_events row, when available. Display-only —
   * the page joins it so FairwayTripDetail can show "Linked to: <event>" without
   * a second client fetch. Null when unlinked or the event was deleted.
   */
  event_title?: string | null;
  event_name: string;
  destination: string;
  transportation_type: 'bus' | 'van' | 'flight' | 'carpool';
  departure_date: string;
  departure_time: string | null;
  departure_location: string | null;
  return_date: string | null;
  return_time: string | null;
  flight_info: string | null;
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_phone: string | null;
  hotel_confirmation: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  room_assignments: string | null;
  uniform_requirements: string | null;
  gear_list: string | null;
  notes: string | null;
  created_at: string | null;
}

export type TransportationType = TravelItinerary['transportation_type'];

/* ───────────────────────────────────────────────────────────────────────────
 * Transport → lucide icon + label. (Legacy used emoji; Fairway uses tokenized
 * line icons — no emoji per the design rules.)
 * ────────────────────────────────────────────────────────────────────────── */
export const TRANSPORT_ICON: Record<TransportationType, ComponentType<{ className?: string }>> = {
  flight: Plane,
  bus: Bus,
  van: Truck,
  carpool: Car,
};

export const TRANSPORT_LABEL: Record<TransportationType, string> = {
  flight: 'Flight',
  bus: 'Bus',
  van: 'Van',
  carpool: 'Carpool',
};

/* ───────────────────────────────────────────────────────────────────────────
 * Trip lifecycle status → Fairway StatusPill tone + label. Predicate is the
 * SAME as the legacy getTripStatus (completed / in-transit / departed / Nd-away
 * / upcoming) — only the tone tokens differ. `now` is passed in so the caller
 * can hold a stable mount-time Date (no SSR hydration drift).
 * ────────────────────────────────────────────────────────────────────────── */
export interface TripStatus {
  label: string;
  tone: FwStatusTone;
  pulse: boolean;
}

/**
 * Parse a bare ISO date string ("YYYY-MM-DD") as **local** midnight, avoiding
 * the UTC-midnight shift that `new Date("YYYY-MM-DD")` applies in browsers
 * (which causes dates to read as the prior calendar day in US timezones).
 */
function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, (m! - 1), d!);
}

export function getTripStatus(itinerary: TravelItinerary, now: Date | null): TripStatus {
  // Until `now` resolves on the client, render a calm neutral "Upcoming" so the
  // server + first client paint agree.
  if (!now) return { label: 'Upcoming', tone: 'neutral', pulse: false };

  // Whole calendar days, not instants (redesign review 2026-09-28): comparing a
  // time-of-day `now` against a local-midnight date marked a trip "Completed"
  // for its whole return day and "In transit" before the bus had left.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = (dateStr: string) =>
    Math.round((parseDateLocal(dateStr).getTime() - today.getTime()) / 86_400_000);
  const toDeparture = dayDiff(itinerary.departure_date);
  const toReturn = itinerary.return_date ? dayDiff(itinerary.return_date) : null;

  // Over only once the return day has passed. With no return date the trip is
  // treated as ending the day after departure, so a one-way row can't pin
  // "Departed" (and the "current trip" hero) forever.
  const ended = toReturn !== null ? toReturn < 0 : toDeparture < -1;
  if (ended) return { label: 'Completed', tone: 'neutral', pulse: false };
  if (toDeparture === 0) return { label: 'Today', tone: 'accent', pulse: false };
  if (toDeparture < 0) {
    return toReturn !== null
      ? { label: 'In transit', tone: 'accent', pulse: true }
      : { label: 'Departed', tone: 'neutral', pulse: false };
  }
  if (toDeparture === 1) return { label: 'Tomorrow', tone: 'warning', pulse: false };
  if (toDeparture <= 7) return { label: `${toDeparture}d away`, tone: 'warning', pulse: false };
  return { label: 'Upcoming', tone: 'neutral', pulse: false };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Date formatter — parses date PARTS directly to avoid the UTC-midnight
 * timezone shift (verbatim from the legacy formatDate).
 * ────────────────────────────────────────────────────────────────────────── */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTravelDate(dateStr: string): string {
  const parts = dateStr.split('T')[0]?.split('-');
  if (parts && parts.length === 3) {
    const month = MONTHS[parseInt(parts[1]!, 10) - 1] ?? parts[1];
    return `${month} ${parseInt(parts[2]!, 10)}, ${parts[0]}`;
  }
  return dateStr;
}

/** 24h "HH:MM" → "h:MM AM/PM" (presentation-only). */
export function formatTravelTime(timeStr: string): string {
  const parts = timeStr.split(':');
  const hour = parseInt(parts[0] || '0', 10);
  const min = parts[1] || '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Redesign helpers (next-departure hero + trip sheet).
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Icon / label with a fallback: the DB CHECK also allows 'other', which the
 * typed maps don't cover, so an unknown value must not render `undefined`.
 */
export function transportIcon(type: string | null | undefined): ComponentType<{ className?: string }> {
  return TRANSPORT_ICON[type as TransportationType] ?? Route;
}
export function transportLabel(type: string | null | undefined): string {
  return TRANSPORT_LABEL[type as TransportationType] ?? 'Travel';
}

/** Whole days from `now` (local midnight) to a YYYY-MM-DD date; negative if past. */
export function daysUntil(dateStr: string, now: Date): number {
  const target = parseDateLocal(dateStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** "Today" / "Tomorrow" / "In 22 days" / "Leaves in 3 days" style lead-in. */
export function countdownLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/** "Tue, Oct 20" — weekday-first, no year (the hero is always near-term). */
export function formatWeekdayDate(dateStr: string): string {
  const d = parseDateLocal(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Month abbreviation + day number for the dated row block. */
export function dateParts(dateStr: string): { month: string; day: string } {
  const d = parseDateLocal(dateStr);
  return { month: MONTHS[d.getMonth()] ?? '', day: String(d.getDate()) };
}

/**
 * Buckets that agree with `getTripStatus`: a trip is "past" only once its
 * status is Completed; in-transit and departed trips are still current.
 * `current` = departed/in transit, `upcoming` = not yet left (asc),
 * `past` = completed (most recent first). Before `now` resolves, everything
 * sorts as upcoming (matches the neutral first-paint pill).
 */
export function groupTrips(
  itineraries: TravelItinerary[],
  now: Date | null,
): { current: TravelItinerary[]; upcoming: TravelItinerary[]; past: TravelItinerary[] } {
  const current: TravelItinerary[] = [];
  const upcoming: TravelItinerary[] = [];
  const past: TravelItinerary[] = [];
  for (const it of itineraries) {
    const label = getTripStatus(it, now).label;
    if (label === 'Completed') past.push(it);
    else if (label === 'In transit' || label === 'Departed') current.push(it);
    else upcoming.push(it);
  }
  const asc = (a: TravelItinerary, b: TravelItinerary) => a.departure_date.localeCompare(b.departure_date);
  upcoming.sort(asc);
  current.sort(asc);
  past.sort((a, b) => b.departure_date.localeCompare(a.departure_date));
  return { current, upcoming, past };
}

/** Apple Maps search link (opens the native Maps app from the iOS shell). */
export function mapsHref(query: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

/** `tel:` link with only dialable characters kept. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** The loader joins `gear_list text[]` with ", "; split it back into items. */
export function splitGear(gear: string | null): string[] {
  if (!gear) return [];
  return gear.split(',').map((g) => g.trim()).filter(Boolean);
}
