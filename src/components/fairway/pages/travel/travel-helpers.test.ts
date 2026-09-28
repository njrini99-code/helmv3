/**
 * travel-helpers: trip timing by local calendar day.
 *
 * The old status compared timestamps: a trip read "Completed" at midnight
 * starting its return day (the team was still on the road), and the masthead
 * counted a trip leaving today as completed. One rule now drives the list
 * groups, the countdown, the default trip and the status pill: upcoming
 * before the departure date, on the road from departure through the return
 * date (or the departure day alone without one), past after that.
 *
 * Fixtures are the demo team's production rows (golf_travel_itineraries,
 * read-only check 2026-09-28): Palmetto Qualifier Jul 7–9 2026, Spring
 * Preview Jul 31–Aug 1 2026, Furman Fall Invitational Retry Oct 20 2026 with
 * no return set.
 */
import { describe, expect, it } from 'vitest';

import {
  type TravelItinerary,
  dateTileParts,
  daysBetween,
  defaultTripId,
  formatTravelDay,
  formatTravelMoney,
  formatTravelRange,
  formatTripNights,
  getTripStatus,
  groupTrips,
  localDateKey,
  tripCountdown,
  tripNights,
  tripPhase,
} from './travel-helpers';

function trip(id: string, departure_date: string, return_date: string | null): TravelItinerary {
  return {
    id,
    event_id: null,
    event_name: id,
    destination: 'Greenville, SC',
    transportation_type: 'van',
    departure_date,
    departure_time: null,
    departure_location: null,
    return_date,
    return_time: null,
    flight_info: null,
    hotel_name: null,
    hotel_address: null,
    hotel_phone: null,
    hotel_confirmation: null,
    check_in_date: null,
    check_out_date: null,
    room_assignments: null,
    uniform_requirements: null,
    gear_list: null,
    notes: null,
    created_at: null,
  };
}

const PALMETTO = trip('palmetto', '2026-07-07', '2026-07-09');
const SPRING = trip('spring', '2026-07-31', '2026-08-01');
const FURMAN = trip('furman', '2026-10-20', null);

/** A moment on a local calendar day; the hour proves the time of day never matters. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('tripPhase', () => {
  it('is on the road from the departure day through the return day', () => {
    expect(tripPhase(PALMETTO, at(2026, 7, 6, 23))).toBe('upcoming');
    expect(tripPhase(PALMETTO, at(2026, 7, 7, 0))).toBe('on_the_road');
    expect(tripPhase(PALMETTO, at(2026, 7, 9, 0))).toBe('on_the_road');
    expect(tripPhase(PALMETTO, at(2026, 7, 9, 23))).toBe('on_the_road');
    expect(tripPhase(PALMETTO, at(2026, 7, 10, 0))).toBe('past');
  });

  it('treats the departure day alone as the trip when no return is set', () => {
    expect(tripPhase(FURMAN, at(2026, 10, 19))).toBe('upcoming');
    expect(tripPhase(FURMAN, at(2026, 10, 20, 22))).toBe('on_the_road');
    expect(tripPhase(FURMAN, at(2026, 10, 21))).toBe('past');
  });

  it('ignores a return date before the departure, and a timestamp tail', () => {
    expect(tripPhase(trip('x', '2026-07-07', '2026-07-01'), at(2026, 7, 7))).toBe('on_the_road');
    expect(tripPhase(trip('x', '2026-07-07T00:00:00Z', null), at(2026, 7, 8))).toBe('past');
  });

  it('reads a trip with no usable date as upcoming', () => {
    expect(tripPhase(trip('x', '', null), at(2026, 9, 28))).toBe('upcoming');
  });
});

describe('tripCountdown', () => {
  it('counts calendar days to departure', () => {
    expect(tripCountdown(FURMAN, at(2026, 9, 28, 23))).toEqual({
      figure: '22',
      label: 'days to go',
      short: 'In 22 days',
    });
    expect(tripCountdown(FURMAN, at(2026, 10, 19))).toEqual({
      figure: null,
      label: 'Leaves tomorrow',
      short: 'Tomorrow',
    });
  });

  it('counts the day of the trip on the road', () => {
    expect(tripCountdown(PALMETTO, at(2026, 7, 7)).label).toBe('Leaves today');
    expect(tripCountdown(PALMETTO, at(2026, 7, 8)).label).toBe('Day 2 of 3');
    expect(tripCountdown(PALMETTO, at(2026, 7, 9))).toEqual({
      figure: null,
      label: 'Heads home today',
      short: 'Home today',
    });
    expect(tripCountdown(FURMAN, at(2026, 10, 20)).label).toBe('Leaves today');
  });

  it('says when a past trip came home, with the year only when it differs', () => {
    expect(tripCountdown(PALMETTO, at(2026, 9, 28)).short).toBe('Returned Jul 9');
    expect(tripCountdown(PALMETTO, at(2027, 1, 5)).short).toBe('Returned Jul 9, 2026');
    expect(tripCountdown(FURMAN, at(2026, 10, 21)).short).toBe('Departed Oct 20');
  });

  it('does not invent a countdown without a date', () => {
    expect(tripCountdown(trip('x', '', null), at(2026, 9, 28)).short).toBe('Date not set');
  });
});

describe('groupTrips and defaultTripId', () => {
  it('groups the demo team on Sep 28: Furman ahead, then the two past trips, latest first', () => {
    const groups = groupTrips([PALMETTO, SPRING, FURMAN], at(2026, 9, 28));
    expect(groups.onTheRoad).toEqual([]);
    expect(groups.upcoming.map((t) => t.id)).toEqual(['furman']);
    expect(groups.past.map((t) => t.id)).toEqual(['spring', 'palmetto']);
    expect(defaultTripId([PALMETTO, SPRING, FURMAN], at(2026, 9, 28))).toBe('furman');
  });

  it('prefers the trip on the road, then the next to leave, then the latest past trip', () => {
    expect(defaultTripId([PALMETTO, SPRING, FURMAN], at(2026, 7, 8))).toBe('palmetto');
    expect(defaultTripId([PALMETTO, SPRING, FURMAN], at(2026, 7, 20))).toBe('spring');
    expect(defaultTripId([PALMETTO, SPRING], at(2026, 9, 28))).toBe('spring');
    expect(defaultTripId([], at(2026, 9, 28))).toBeNull();
  });

  it('orders upcoming trips soonest first, undated trips last', () => {
    const undated = trip('undated', '', null);
    const groups = groupTrips([undated, FURMAN, SPRING], at(2026, 7, 1));
    expect(groups.upcoming.map((t) => t.id)).toEqual(['spring', 'furman', 'undated']);
  });
});

describe('getTripStatus', () => {
  it('pulses only while on the road, and names a past trip by whether it had a return', () => {
    expect(getTripStatus(FURMAN, null)).toEqual({ label: 'Upcoming', tone: 'neutral', pulse: false });
    expect(getTripStatus(FURMAN, at(2026, 9, 28))).toEqual({ label: 'Upcoming', tone: 'info', pulse: false });
    expect(getTripStatus(PALMETTO, at(2026, 7, 9))).toEqual({ label: 'On the road', tone: 'accent', pulse: true });
    expect(getTripStatus(PALMETTO, at(2026, 7, 10)).label).toBe('Completed');
    expect(getTripStatus(FURMAN, at(2026, 10, 21)).label).toBe('Departed');
  });
});

describe('nights and formatting', () => {
  it('counts nights away', () => {
    expect(tripNights(PALMETTO)).toBe(2);
    expect(tripNights(SPRING)).toBe(1);
    expect(tripNights(FURMAN)).toBeNull();
    expect(tripNights(trip('x', '2026-07-07', '2026-07-07'))).toBe(0);
    expect(formatTripNights(PALMETTO)).toBe('2 nights');
    expect(formatTripNights(SPRING)).toBe('1 night');
    expect(formatTripNights(trip('x', '2026-07-07', '2026-07-07'))).toBe('Day trip');
    expect(formatTripNights(FURMAN)).toBeNull();
  });

  it('counts days across a DST change without drift', () => {
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
    expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1);
    expect(daysBetween('2026-09-28', '2026-10-20')).toBe(22);
  });

  it('formats ranges as short as they stay unambiguous', () => {
    expect(formatTravelRange('2026-10-20', null)).toBe('Oct 20, 2026');
    expect(formatTravelRange('2026-07-07', '2026-07-09')).toBe('Jul 7–9, 2026');
    expect(formatTravelRange('2026-07-31', '2026-08-01')).toBe('Jul 31 – Aug 1, 2026');
    expect(formatTravelRange('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027');
    expect(formatTravelRange('2026-07-07', '2026-07-07')).toBe('Jul 7, 2026');
  });

  it('formats a day with its weekday from the calendar date', () => {
    expect(formatTravelDay('2026-10-20')).toBe('Tue, Oct 20');
    expect(formatTravelDay('2026-07-07', true)).toBe('Tue, Jul 7, 2026');
    expect(dateTileParts('2026-10-20')).toEqual({ month: 'OCT', day: 20, weekday: 'Tue' });
    expect(dateTileParts('')).toBeNull();
  });

  it('keys the local calendar day and keeps cents on money', () => {
    expect(localDateKey(at(2026, 1, 5, 23))).toBe('2026-01-05');
    expect(formatTravelMoney(123.45)).toBe('$123.45');
    expect(formatTravelMoney(80)).toBe('$80.00');
  });
});
