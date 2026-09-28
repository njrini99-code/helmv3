/**
 * ============================================================================
 * Fairway · pages/travel · travel-helpers
 * ----------------------------------------------------------------------------
 * Shared types + presentation helpers for the Fairway Travel surface. PURE
 * presentation — no data fetching, no writes. The `TravelItinerary` shape is
 * the legacy TravelClient prop shape plus the optional `gear_items` array.
 *
 * Trip timing is by local calendar day (`tripPhase`): upcoming before the
 * departure date, on the road from departure through the return date (or the
 * departure day alone without one), past after it. The list groups, the
 * countdown, the default trip and the status pill all read that one rule.
 * Tokens / Fairway StatusPill tones only.
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
  /**
   * The gear list as the DB stores it (text[]), for display as one chip per
   * item. `gear_list` above is the same list joined with ", " for the editor;
   * splitting that string back apart would break an item that contains a
   * comma. Optional: rows mapped before this field existed read the string.
   */
  gear_items?: string[] | null;
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
 * Calendar days. A trip runs from its departure date to its return date (or
 * its departure date alone when no return is set), compared as local
 * calendar days: the team is on the road on its return day until that day
 * ends, and a trip leaving today is not "completed". Keys are bare
 * "YYYY-MM-DD" strings, so they compare as text.
 * ────────────────────────────────────────────────────────────────────────── */

/** The local calendar day of `date` as "YYYY-MM-DD". */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The "YYYY-MM-DD" head of a date or timestamp string; null when malformed. */
function dateKeyOf(value: string | null | undefined): string | null {
  const head = (value ?? '').split('T')[0] ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

/** Whole calendar days from one key to another, counted in UTC so DST never shifts it. */
export function daysBetween(fromKey: string, toKey: string): number {
  const utc = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((utc(toKey) - utc(fromKey)) / 86_400_000);
}

/** A trip's first and last day; null without a usable departure date. */
function tripSpan(itinerary: TravelItinerary): { start: string; end: string } | null {
  const start = dateKeyOf(itinerary.departure_date);
  if (!start) return null;
  const back = dateKeyOf(itinerary.return_date);
  return { start, end: back && back >= start ? back : start };
}

export type TripPhase = 'upcoming' | 'on_the_road' | 'past';

/** Where a trip stands on `now`'s calendar day. A trip with no usable date reads as upcoming. */
export function tripPhase(itinerary: TravelItinerary, now: Date): TripPhase {
  const span = tripSpan(itinerary);
  if (!span) return 'upcoming';
  const today = localDateKey(now);
  if (today < span.start) return 'upcoming';
  if (today > span.end) return 'past';
  return 'on_the_road';
}

/** Nights away (return minus departure); null without a return date. 0 is a day trip. */
export function tripNights(itinerary: TravelItinerary): number | null {
  const start = dateKeyOf(itinerary.departure_date);
  const back = dateKeyOf(itinerary.return_date);
  if (!start || !back || back < start) return null;
  return daysBetween(start, back);
}

export interface TripCountdown {
  /** The big figure for a countdown tile ("22"), or null when words read better. */
  figure: string | null;
  /** The words under or instead of the figure: "days to go", "Leaves tomorrow", "Day 2 of 3". */
  label: string;
  /** One line for a list row: "In 22 days", "Tomorrow", "Day 2 of 3", "Returned Aug 1". */
  short: string;
}

/**
 * How far off a trip is, in the words a coach would use. Upcoming counts
 * calendar days to departure; on the road counts the day of the trip; a past
 * trip says when it came home (or left, when no return was set).
 */
export function tripCountdown(itinerary: TravelItinerary, now: Date): TripCountdown {
  const span = tripSpan(itinerary);
  if (!span) return { figure: null, label: 'Date not set', short: 'Date not set' };
  const today = localDateKey(now);
  const phase = tripPhase(itinerary, now);

  if (phase === 'upcoming') {
    const days = daysBetween(today, span.start);
    if (days === 1) return { figure: null, label: 'Leaves tomorrow', short: 'Tomorrow' };
    return { figure: String(days), label: 'days to go', short: `In ${days} days` };
  }
  if (phase === 'on_the_road') {
    const total = daysBetween(span.start, span.end) + 1;
    const day = daysBetween(span.start, today) + 1;
    if (day === 1) return { figure: null, label: 'Leaves today', short: 'Leaves today' };
    if (day === total) return { figure: null, label: 'Heads home today', short: 'Home today' };
    return { figure: null, label: `Day ${day} of ${total}`, short: `Day ${day} of ${total}` };
  }
  const year = now.getFullYear();
  const when = (key: string) => formatShortDay(key, Number(key.slice(0, 4)) !== year);
  const words = itinerary.return_date ? `Returned ${when(span.end)}` : `Departed ${when(span.start)}`;
  return { figure: null, label: words, short: words };
}

export interface TripGroups {
  onTheRoad: TravelItinerary[];
  /** Soonest first; trips with no usable date last. */
  upcoming: TravelItinerary[];
  /** Most recent first. */
  past: TravelItinerary[];
}

export function groupTrips(itineraries: ReadonlyArray<TravelItinerary>, now: Date): TripGroups {
  const groups: TripGroups = { onTheRoad: [], upcoming: [], past: [] };
  for (const itinerary of itineraries) {
    const phase = tripPhase(itinerary, now);
    (phase === 'on_the_road' ? groups.onTheRoad : phase === 'upcoming' ? groups.upcoming : groups.past).push(
      itinerary,
    );
  }
  const startOf = (i: TravelItinerary) => tripSpan(i)?.start ?? '9999-12-31';
  const endOf = (i: TravelItinerary) => tripSpan(i)?.end ?? '';
  const soonest = (a: TravelItinerary, b: TravelItinerary) =>
    startOf(a).localeCompare(startOf(b)) || a.id.localeCompare(b.id);
  groups.onTheRoad.sort(soonest);
  groups.upcoming.sort(soonest);
  groups.past.sort((a, b) => endOf(b).localeCompare(endOf(a)) || soonest(b, a));
  return groups;
}

/** The trip the detail panel opens on: one on the road, else the next to leave, else the latest past trip. */
export function defaultTripId(itineraries: ReadonlyArray<TravelItinerary>, now: Date): string | null {
  const { onTheRoad, upcoming, past } = groupTrips(itineraries, now);
  return onTheRoad[0]?.id ?? upcoming[0]?.id ?? past[0]?.id ?? null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Trip lifecycle status → Fairway StatusPill tone + label, on the same
 * calendar-day phases as the list groups and the countdown, so the card and
 * the detail can never disagree. On the road is the live (accent, pulsing)
 * state; upcoming reads in ink (info); a past trip is quiet (neutral), and
 * says "Departed" rather than "Completed" when no return date was set.
 * `now` is passed in so the caller can hold a stable Date (no SSR drift).
 * ────────────────────────────────────────────────────────────────────────── */
export interface TripStatus {
  label: string;
  tone: FwStatusTone;
  pulse: boolean;
}

export function getTripStatus(itinerary: TravelItinerary, now: Date | null): TripStatus {
  // Until `now` resolves, render a calm "Upcoming" so server + first client paint agree.
  if (!now) return { label: 'Upcoming', tone: 'neutral', pulse: false };
  const phase = tripPhase(itinerary, now);
  if (phase === 'on_the_road') return { label: 'On the road', tone: 'accent', pulse: true };
  if (phase === 'past') {
    return { label: itinerary.return_date ? 'Completed' : 'Departed', tone: 'neutral', pulse: false };
  }
  return { label: 'Upcoming', tone: 'info', pulse: false };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Date formatters — parse date PARTS directly to avoid the UTC-midnight
 * timezone shift (formatTravelDate is verbatim from the legacy formatDate).
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function keyParts(dateKey: string): { y: number; m: number; d: number } | null {
  const key = dateKeyOf(dateKey);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

/** "Jul 9", or "Jul 9, 2025" with the year. */
function formatShortDay(dateKey: string, withYear: boolean): string {
  const p = keyParts(dateKey);
  if (!p) return dateKey;
  return `${MONTHS[p.m - 1]} ${p.d}${withYear ? `, ${p.y}` : ''}`;
}

/**
 * "Tue, Oct 20" (or "Tue, Oct 20, 2026" with the year) — the weekday from the
 * local calendar date, never a UTC shift.
 */
export function formatTravelDay(dateKey: string, withYear = false): string {
  const p = keyParts(dateKey);
  if (!p) return dateKey;
  const weekday = WEEKDAYS[new Date(p.y, p.m - 1, p.d).getDay()];
  return `${weekday}, ${MONTHS[p.m - 1]} ${p.d}${withYear ? `, ${p.y}` : ''}`;
}

/** "2 nights", "1 night", "Day trip"; null without a return date. */
export function formatTripNights(itinerary: TravelItinerary): string | null {
  const nights = tripNights(itinerary);
  if (nights === null) return null;
  if (nights === 0) return 'Day trip';
  return nights === 1 ? '1 night' : `${nights} nights`;
}

/**
 * Dollars with cents, always: a coach reconciles these totals against
 * receipts and the CSV export (the same rule as FairwayExpenseSummary).
 */
export function formatTravelMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * A trip's dates as short as they stay unambiguous: "Oct 20, 2026",
 * "Jul 7–9, 2026", "Jul 31 – Aug 1, 2026", "Dec 30, 2026 – Jan 2, 2027".
 */
export function formatTravelRange(start: string, end: string | null | undefined): string {
  const a = keyParts(start);
  const b = end && end !== start ? keyParts(end) : null;
  if (!a) return start;
  if (!b) return formatShortDay(start, true);
  if (a.y !== b.y || `${end}` < start) return `${formatShortDay(start, true)} – ${formatShortDay(end as string, true)}`;
  if (a.m === b.m) return `${MONTHS[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
  return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}, ${a.y}`;
}

/** The parts of a date tile: "OCT", 20, "Tue". Null without a usable date. */
export function dateTileParts(dateKey: string): { month: string; day: number; weekday: string } | null {
  const p = keyParts(dateKey);
  if (!p) return null;
  return {
    month: (MONTHS[p.m - 1] ?? '').toUpperCase(),
    day: p.d,
    weekday: WEEKDAYS[new Date(p.y, p.m - 1, p.d).getDay()] ?? '',
  };
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
