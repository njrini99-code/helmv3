/**
 * ============================================================================
 * FairwayTripDetail — #87 header truncation regression coverage
 * ----------------------------------------------------------------------------
 * The header (trip name + destination line) used `truncate`, which clips to
 * a single line with a mid-word ellipsis — illegible for a long trip name or
 * destination, even though the header spans the FULL WIDTH of the detail
 * column (there's no space constraint forcing a clip). Fixed by dropping
 * `truncate` for `break-words` on the name, and switching the destination
 * row from a rigid single-line flex to `flex-wrap` so long destinations wrap
 * instead of clipping.
 *
 * jsdom doesn't compute real line-wrapping, so this locks the CLASS CONTRACT:
 * neither the trip-name heading nor the destination span carry `truncate`
 * anymore, and the destination row is allowed to wrap.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FairwayTripDetail } from './FairwayTripDetail';
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

const noop = () => {};

function renderDetail(itinerary: TravelItinerary) {
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

    // The row (icon + destination + separator + transport label) must be
    // allowed to wrap onto multiple lines rather than forcing everything
    // onto one line that then has to clip.
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
