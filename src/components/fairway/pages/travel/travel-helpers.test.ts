import { describe, it, expect } from 'vitest';
import { groupTrips, getTripStatus, daysUntil, splitGear, telHref, transportIcon, type TravelItinerary } from './travel-helpers';

function trip(id: string, departure: string, ret: string | null): TravelItinerary {
  return {
    id, event_id: null, event_title: null, event_name: id, destination: 'X', transportation_type: 'bus',
    departure_date: departure, departure_time: null, departure_location: null, return_date: ret, return_time: null,
    flight_info: null, hotel_name: null, hotel_address: null, hotel_phone: null, hotel_confirmation: null,
    check_in_date: null, check_out_date: null, room_assignments: null, uniform_requirements: null,
    gear_list: null, notes: null, created_at: null,
  };
}

describe('travel-helpers — grouping agrees with the status pills', () => {
  const now = new Date(2026, 8, 28, 10); // Sep 28, 2026
  const trips = [
    trip('past-old', '2026-07-07', '2026-07-09'),
    trip('past-new', '2026-07-31', '2026-08-01'),
    trip('on-the-road', '2026-09-27', '2026-09-30'),
    trip('later', '2026-10-20', null),
    trip('next', '2026-10-15', null),
  ];

  it('buckets by status: completed → past (newest first), in transit → current, the rest upcoming (soonest first)', () => {
    const g = groupTrips(trips, now);
    expect(g.past.map((t) => t.id)).toEqual(['past-new', 'past-old']);
    expect(g.current.map((t) => t.id)).toEqual(['on-the-road']);
    expect(g.upcoming.map((t) => t.id)).toEqual(['next', 'later']);
    for (const t of g.past) expect(getTripStatus(t, now).label).toBe('Completed');
    expect(getTripStatus(g.current[0]!, now).label).toBe('In transit');
  });

  it('uses calendar days: a trip is live all day on its dates, and a one-way trip ends', () => {
    const at = (h: number) => new Date(2026, 9, 15, h); // Oct 15, 2026
    const sameDay = trip('same-day', '2026-10-15', '2026-10-15');
    expect(getTripStatus(sameDay, at(5)).label).toBe('Today'); // departure morning, not "In transit"
    expect(getTripStatus(sameDay, at(21)).label).toBe('Today'); // still today at 9 PM, not "Completed"
    expect(groupTrips([sameDay], at(21)).upcoming.map((t) => t.id)).toEqual(['same-day']);

    const multi = trip('multi', '2026-10-13', '2026-10-15');
    expect(getTripStatus(multi, at(10)).label).toBe('In transit'); // return day, before the 8 PM return
    expect(getTripStatus(multi, new Date(2026, 9, 16, 1)).label).toBe('Completed');

    const oneWay = trip('one-way', '2026-10-14', null);
    expect(getTripStatus(oneWay, at(10)).label).toBe('Departed');
    expect(getTripStatus(oneWay, new Date(2026, 9, 17)).label).toBe('Completed');
    // …so it can't hold the "current trip" slot over the real next trip.
    const g = groupTrips([oneWay, trip('next', '2026-10-20', null)], new Date(2026, 9, 17));
    expect(g.current).toHaveLength(0);
    expect(g.upcoming[0]!.id).toBe('next');
  });

  it('counts whole days to departure from local midnight', () => {
    expect(daysUntil('2026-10-15', now)).toBe(17);
    expect(daysUntil('2026-09-28', now)).toBe(0);
  });

  it('splits the joined gear list, builds a dialable tel: link, and never returns an undefined icon', () => {
    expect(splitGear('Full bag, Rain suit ,  , Sunscreen')).toEqual(['Full bag', 'Rain suit', 'Sunscreen']);
    expect(splitGear(null)).toEqual([]);
    expect(telHref('(864) 242-7525')).toBe('tel:8642427525');
    expect(transportIcon('other')).toBeDefined();
  });
});
