/**
 * FairwayTripCard (Travel list row).
 *
 * Layout: at 390px the status pill beside the trip name left the name a few
 * characters before the ellipsis. The name owns the text column and wraps to
 * two lines; the status pill sits on its own line under the dates. jsdom
 * doesn't lay out text, so this locks the class contract.
 *
 * Status (owner 2026-09-28): the pill says how far off the trip is, by local
 * calendar day (travel-helpers `tripPhase`), and a past trip recedes (no fill,
 * secondary ink). The default trip, shown in the desktop panel before any
 * pick, is marked from `lg` only and is not reported as pressed.
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

/** Local noon on a calendar day, so no timezone can move the date. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe('FairwayTripCard', () => {
  it('wraps a long trip name to two lines instead of clipping it to one', () => {
    render(<FairwayTripCard itinerary={makeItinerary()} selected={false} now={null} onSelect={() => {}} />);

    const name = screen.getByText(LONG_NAME);
    expect(name).not.toHaveClass('truncate');
    expect(name).toHaveClass('line-clamp-2');
    expect(screen.getByRole('button')).not.toHaveClass('whitespace-nowrap');
  });

  it('puts the status pill on its own line under the dates, not beside the name', () => {
    render(<FairwayTripCard itinerary={makeItinerary()} selected={false} now={null} onSelect={() => {}} />);

    const name = screen.getByText(LONG_NAME);
    const dates = screen.getByText('Aug 1–3, 2026');
    const pill = screen.getByText('Upcoming').closest('[class*="rounded-full"]');
    const column = name.parentElement;

    // Name, destination, dates and pill are stacked children of one column.
    expect(pill?.parentElement).toBe(column);
    expect(column?.lastElementChild).toBe(pill);
    expect(column?.firstElementChild).toBe(name);
    expect(dates.closest('span.flex')?.parentElement).toBe(column);
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

  it('counts down to an upcoming trip in calendar days', () => {
    // Production: Furman Fall Invitational Retry, Oct 20 2026, no return set.
    render(
      <FairwayTripCard
        itinerary={makeItinerary({ departure_date: '2026-10-20', return_date: null })}
        selected={false}
        now={day(2026, 9, 28)}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText('In 22 days')).toBeInTheDocument();
    expect(screen.getByText('Oct 20, 2026')).toBeInTheDocument();
    const row = screen.getByRole('button');
    expect(row).toHaveClass('bg-surface');
    expect(row).not.toHaveClass('bg-transparent');
  });

  it('marks the trip on the road, through its return day', () => {
    // Production: Palmetto Qualifier, Jul 7 to Jul 9 2026.
    const palmetto = makeItinerary({ departure_date: '2026-07-07', return_date: '2026-07-09' });
    const { rerender } = render(
      <FairwayTripCard itinerary={palmetto} selected={false} now={day(2026, 7, 8)} onSelect={() => {}} />,
    );
    const pill = screen.getByText('Day 2 of 3').closest('[data-slot="fw-status-pill"]');
    expect(pill).toHaveAttribute('data-tone', 'accent');

    rerender(<FairwayTripCard itinerary={palmetto} selected={false} now={day(2026, 7, 9)} onSelect={() => {}} />);
    expect(screen.getByText('Home today')).toBeInTheDocument();
  });

  it('lets a past trip recede and says when it came home', () => {
    render(
      <FairwayTripCard
        itinerary={makeItinerary({ departure_date: '2026-07-07', return_date: '2026-07-09' })}
        selected={false}
        now={day(2026, 9, 28)}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText('Returned Jul 9')).toBeInTheDocument();
    const row = screen.getByRole('button');
    expect(row).toHaveClass('bg-transparent');
    expect(screen.getByText(LONG_NAME)).toHaveClass('text-text-secondary');
  });

  it('marks the default trip from lg only, without reporting it pressed', () => {
    render(
      <FairwayTripCard
        itinerary={makeItinerary()}
        selected={false}
        shownOnDesktop
        now={day(2026, 7, 1)}
        onSelect={() => {}}
      />,
    );

    const row = screen.getByRole('button');
    expect(row).toHaveAttribute('aria-pressed', 'false');
    expect(row).toHaveClass('lg:border-border-strong');
    expect(row).not.toHaveClass('border-border-strong');
  });
});
