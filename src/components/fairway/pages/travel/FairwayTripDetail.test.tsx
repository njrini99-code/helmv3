/**
 * ============================================================================
 * FairwayTripDetail
 * ----------------------------------------------------------------------------
 * #87 header truncation: the trip name and destination used `truncate`,
 * clipping mid-word though the header spans the whole detail column. The
 * name wraps (`break-words`) and the destination row may wrap (`flex-wrap`).
 * jsdom doesn't compute line-wrapping, so those lock the class contract.
 *
 * Owner 2026-09-28 rebuild: the journey band carries the schedule, the
 * countdown reads calendar days, the modules render only what exists, the gear
 * list keeps the DB's items whole, the phone number dials, and the delete
 * confirm never claims zero expenses from a list it has not read.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { FairwayTripDetail, type FairwayTripDetailProps } from './FairwayTripDetail';
import type { TravelItinerary } from './travel-helpers';

function makeItinerary(overrides: Partial<TravelItinerary> = {}): TravelItinerary {
  return {
    id: 'trip-1',
    event_id: null,
    event_title: null,
    event_name: 'Trip',
    destination: 'Pinehurst, NC',
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

/** The production Palmetto Qualifier row (demo team), as the page maps it. */
const PALMETTO = makeItinerary({
  id: '3eced5b3-9bdd-4c46-8949-f8ac85602cca',
  event_id: 'f31587e5-0809-4295-bfd5-082f5462d736',
  event_title: 'Palmetto Qualifier — Travel to Greenville',
  event_name: 'Palmetto Qualifier — Greenville',
  destination: 'Greenville, SC',
  transportation_type: 'van',
  departure_date: '2026-07-07',
  departure_time: '06:00:00',
  departure_location: 'Athletic Complex Parking Lot',
  return_date: '2026-07-09',
  return_time: '20:00:00',
  hotel_name: 'Marriott Greenville Downtown',
  hotel_address: '1 Parkway E, Greenville, SC 29601',
  hotel_phone: '(864) 242-7525',
  hotel_confirmation: 'MRD-2026-Q1-DEMO',
  uniform_requirements: 'Game-day uniform Day 1 (Friday). Casual team gear Day 2 travel home.',
  gear_list: 'Full bag, Rain suit, Extra gloves, Yardage book, Sunscreen',
  gear_items: ['Full bag', 'Rain suit', 'Extra gloves', 'Yardage book', 'Sunscreen'],
  notes: 'Van capacity 12. Arrive 05:45 to load clubs. No pets. Keys to hotel rooms distributed on arrival.',
});

/** Local noon on a calendar day, so no timezone can move the date. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

const noop = () => {};

function renderDetail(itinerary: TravelItinerary, props: Partial<FairwayTripDetailProps> = {}) {
  return render(
    <FairwayTripDetail
      itinerary={itinerary}
      isCoach={false}
      activeTab="details"
      onTabChange={noop}
      onEdit={noop}
      onDelete={noop}
      expenses={[]}
      expenseSummary={null}
      budgets={[]}
      loadingExpenses={false}
      exporting={false}
      onAddExpense={noop}
      onEditExpense={noop}
      onRefreshExpenses={noop}
      onExportCSV={noop}
      {...props}
    />,
  );
}

describe('FairwayTripDetail — #87 header truncation', () => {
  it('never truncates the trip-name heading, even when it is long', () => {
    const itinerary = makeItinerary({
      event_name: 'NCAA Division I Regional Championship Qualifying Tournament Week',
    });
    renderDetail(itinerary);

    const heading = screen.getByRole('heading', { level: 2, name: itinerary.event_name });
    expect(heading).not.toHaveClass('truncate');
    expect(heading).toHaveClass('break-words');
  });

  it('never truncates the destination, and lets the destination row wrap', () => {
    const itinerary = makeItinerary({
      destination: 'Pinehurst Resort & Country Club, Village of Pinehurst, North Carolina',
    });
    renderDetail(itinerary);

    const destination = screen.getByText(itinerary.destination);
    expect(destination).not.toHaveClass('truncate');
    expect(destination).toHaveClass('break-words');

    // The row must be allowed to wrap onto multiple lines rather than forcing
    // everything onto one line that then has to clip.
    const row = destination.parentElement;
    expect(row).toHaveClass('flex-wrap');
  });

  it('still renders the short-name/short-destination case unchanged (no regression)', () => {
    const itinerary = makeItinerary();
    renderDetail(itinerary);

    expect(screen.getByRole('heading', { level: 2, name: 'Trip' })).toBeInTheDocument();
    expect(screen.getByText('Pinehurst, NC')).toBeInTheDocument();
  });
});

describe('FairwayTripDetail — the trip, read top to bottom', () => {
  it('lays the schedule out as one journey: depart, transport and nights, return', () => {
    renderDetail(PALMETTO, { now: day(2026, 6, 20) });

    const band = screen.getByRole('region', { name: 'Schedule' });
    expect(within(band).getByText('Tue, Jul 7')).toBeInTheDocument();
    expect(within(band).getByText('6:00 AM · Athletic Complex Parking Lot')).toBeInTheDocument();
    expect(within(band).getByText('Thu, Jul 9')).toBeInTheDocument();
    expect(within(band).getByText('8:00 PM')).toBeInTheDocument();
    expect(band).toHaveTextContent('Van · 2 nights');
  });

  it('says "Not set" for a missing return instead of inventing one', () => {
    // Production: Furman Fall Invitational Retry has no return, time or place.
    renderDetail(
      makeItinerary({ event_name: 'Furman Fall Invitational Retry', departure_date: '2026-10-20', return_date: null }),
      { now: day(2026, 9, 28) },
    );

    const band = screen.getByRole('region', { name: 'Schedule' });
    expect(within(band).getByText('Tue, Oct 20')).toBeInTheDocument();
    expect(within(band).getByText('Not set')).toBeInTheDocument();
    expect(band).toHaveTextContent('Bus');
    expect(band).not.toHaveTextContent('night');
  });

  it('counts down in calendar days, as a tile and as a phone line', () => {
    renderDetail(makeItinerary({ departure_date: '2026-10-20', return_date: null }), { now: day(2026, 9, 28) });

    const tile = screen.getByTestId('trip-countdown');
    expect(tile).toHaveTextContent('22days to go');
    expect(screen.getByText('22 days to go')).toHaveClass('sm:hidden');
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });

  it('shows no countdown on a past trip, and calls it completed', () => {
    renderDetail(PALMETTO, { now: day(2026, 9, 28) });

    expect(screen.queryByTestId('trip-countdown')).toBeNull();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows lodging with a dialable phone and the confirmation number', () => {
    renderDetail(PALMETTO, { now: day(2026, 9, 28) });

    expect(screen.getByRole('heading', { level: 3, name: 'Lodging' })).toBeInTheDocument();
    expect(screen.getByText('Marriott Greenville Downtown')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '(864) 242-7525' })).toHaveAttribute('href', 'tel:8642427525');
    expect(screen.getByText('MRD-2026-Q1-DEMO')).toBeInTheDocument();
  });

  it('lists gear one item per line from the DB array, never splitting an item on its comma', () => {
    renderDetail(
      makeItinerary({
        gear_list: 'Rain suit, umbrella, Yardage book',
        gear_items: ['Rain suit, umbrella', 'Yardage book'],
      }),
    );

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Rain suit, umbrella', 'Yardage book']);
  });

  it('links the calendar event the trip belongs to', () => {
    renderDetail(PALMETTO, { now: day(2026, 9, 28) });

    const link = screen.getByRole('link', { name: /Palmetto Qualifier — Travel to Greenville/ });
    expect(link).toHaveAttribute('href', '/golf/dashboard/calendar?event=f31587e5-0809-4295-bfd5-082f5462d736');
  });

  it('keeps the honest line when nothing but the schedule is posted', () => {
    renderDetail(makeItinerary());

    expect(screen.getByText(/No lodging or logistics added yet/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Lodging' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: 'What to bring' })).toBeNull();
  });
});

describe('FairwayTripDetail — expenses module and the delete confirm', () => {
  it('waits for the read before saying no expenses are logged', () => {
    const { rerender } = renderDetail(makeItinerary(), { loadingExpenses: true, expenseCount: null });
    expect(screen.queryByText('No expenses logged yet.')).toBeNull();

    rerender(
      <FairwayTripDetail
        itinerary={makeItinerary()}
        isCoach={false}
        activeTab="details"
        onTabChange={noop}
        onEdit={noop}
        onDelete={noop}
        expenses={[]}
        expenseSummary={null}
        budgets={[]}
        loadingExpenses={false}
        expenseCount={0}
        exporting={false}
        onAddExpense={noop}
        onEditExpense={noop}
        onRefreshExpenses={noop}
        onExportCSV={noop}
      />,
    );
    expect(screen.getByText('No expenses logged yet.')).toBeInTheDocument();
  });

  it('offers a retry when the read failed, never a cheerful empty state', () => {
    const onRefreshExpenses = vi.fn();
    renderDetail(makeItinerary(), { expensesFailed: true, expenseCount: null, onRefreshExpenses });

    expect(screen.getByText('Expenses could not load.')).toBeInTheDocument();
    expect(screen.queryByText('No expenses logged yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRefreshExpenses).toHaveBeenCalledTimes(1);
  });

  it('shows the total with cents and opens the Expenses tab', () => {
    const onTabChange = vi.fn();
    renderDetail(makeItinerary(), {
      onTabChange,
      expenses: [
        { id: 'e1', amount: 123.45 },
        { id: 'e2', amount: 80 },
      ] as FairwayTripDetailProps['expenses'],
      expenseSummary: { total: 203.45, count: 2 } as FairwayTripDetailProps['expenseSummary'],
    });

    expect(screen.getByText('$203.45').parentElement).toHaveTextContent('$203.45 across 2 expenses');
    fireEvent.click(screen.getByRole('button', { name: 'Open expenses' }));
    expect(onTabChange).toHaveBeenCalledWith('expenses');
  });

  it('names the cascade only once the count is known', () => {
    const { unmount } = renderDetail(makeItinerary(), { isCoach: true, expenseCount: null, loadingExpenses: true });
    fireEvent.click(screen.getByRole('button', { name: 'Delete itinerary' }));
    expect(screen.getByText('This removes the entire itinerary and any expenses logged on it.')).toBeInTheDocument();
    unmount();

    renderDetail(makeItinerary(), { isCoach: true, expenseCount: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Delete itinerary' }));
    expect(screen.getByText('and its 3 expenses')).toBeInTheDocument();
  });
});
