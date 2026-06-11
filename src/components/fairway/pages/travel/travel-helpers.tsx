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

import { Plane, Bus, Car, Truck } from 'lucide-react';
import type { ComponentType } from 'react';
import type { FwStatusTone } from '@/components/fairway/controls';

/* ───────────────────────────────────────────────────────────────────────────
 * Data shape — verbatim from the legacy TravelClient props. The page maps the
 * golf_travel_itineraries rows into this exact shape for BOTH branches.
 * ────────────────────────────────────────────────────────────────────────── */
export interface TravelItinerary {
  id: string;
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

  const departure = parseDateLocal(itinerary.departure_date);
  const returnDate = itinerary.return_date ? parseDateLocal(itinerary.return_date) : null;
  const diffMs = departure.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (returnDate && now > returnDate) {
    return { label: 'Completed', tone: 'neutral', pulse: false };
  }
  if (now >= departure && returnDate && now <= returnDate) {
    return { label: 'In transit', tone: 'accent', pulse: true };
  }
  if (now >= departure && !returnDate) {
    return { label: 'Departed', tone: 'neutral', pulse: false };
  }
  if (diffDays <= 7 && diffDays > 0) {
    return { label: `${diffDays}d away`, tone: 'warning', pulse: false };
  }
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
