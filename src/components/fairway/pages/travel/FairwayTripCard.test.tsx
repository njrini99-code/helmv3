/**
 * FairwayTripCard (Travel list row): at 390px the status pill beside the trip
 * name left the name a few characters before the ellipsis. The name now owns
 * the text column and wraps to two lines; the status pill moved to its own
 * line under the dates.
 *
 * jsdom doesn't lay out text, so this locks the class contract: no single-line
 * clip on the name, no nowrap inherited from the control, and the pill no
 * longer shares the name's line.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { FairwayTripCard } from './FairwayTripCard';
import type { TravelItinerary } from './travel-helpers';

const LONG_NAME = 'Jones Cup Invitational at Sea Island Golf Club';

function makeItinerary(overrides: Partial<TravelItinerary> = {}): TravelItinerary {
  return {
    id: 'trip-1',
    event_id: null,
    event_title: null,
    event_name: LONG_NAME,
    destination: 'St. Simons Island, GA',
    transportation_type: 'bus',
    departure_date: '2026-08-01',
    departure_time: null,
    departure_location: null,
    return_date: '2026-08-03',
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
    ...overrides,
  };
}

describe('FairwayTripCard', () => {
  it('wraps a long trip name to two lines instead of clipping it to one', () => {
    render(<FairwayTripCard itinerary={makeItinerary()} selected={false} now={null} onSelect={() => {}} />);

    const name = screen.getByText(LONG_NAME);
    expect(name).not.toHaveClass('truncate');
    expect(name).toHaveClass('line-clamp-2');
    expect(screen.getByRole('button')).not.toHaveClass('whitespace-nowrap');
  });

  it('puts the status pill on its own line under the dates, not beside the name', () => {
    // 3 days out, so the row carries an informative countdown pill (a plain
    // "Upcoming" is omitted: the "Coming up" section already says it).
    const now = new Date(2026, 6, 29, 9);
    render(<FairwayTripCard itinerary={makeItinerary()} selected={false} now={now} onSelect={() => {}} />);

    const name = screen.getByText(LONG_NAME);
    const dates = screen.getByText(/Aug 1, 2026/);
    const pill = screen.getByText('3d away').closest('[class*="rounded-full"]');
    const column = name.parentElement;

    // Name, destination, dates and pill are stacked children of one column.
    expect(pill?.parentElement).toBe(column);
    expect(column?.lastElementChild).toBe(pill);
    expect(column?.firstElementChild).toBe(name);
    expect(dates.parentElement).toBe(column);
  });

  it('omits the pill when it would only repeat the section ("Upcoming")', () => {
    render(<FairwayTripCard itinerary={makeItinerary()} selected={false} now={null} onSelect={() => {}} />);
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
  });

  it('is one pressable row that reports selection and fires onSelect', () => {
    const onSelect = vi.fn();
    render(<FairwayTripCard itinerary={makeItinerary()} selected now={null} onSelect={onSelect} />);

    const row = screen.getByRole('button', { name: new RegExp(LONG_NAME) });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).toHaveAttribute('type', 'button');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
