/**
 * ============================================================================
 * FairwayTravel — #173 orphaned desktop detail-pane regression coverage
 * ----------------------------------------------------------------------------
 * With a long enough trip list, the CSS-Grid `stretch` default matched the
 * detail column's height to the (much taller) list column, then vertically
 * centered its content — so the "Select a trip" empty state, and the real
 * detail view once a trip is picked, rendered far below the fold instead of
 * staying in view. The fix pins the detail column near the top of the
 * viewport at `lg:` (`sticky` + `self-start`, mirroring FairwayTasks's
 * templates rail) so it's always visible while the list scrolls beside it.
 *
 * jsdom can't measure real layout/stretch, so this locks the CLASS CONTRACT
 * that produces the fix: the grid disables stretch (`lg:items-start`) and the
 * detail column opts out of it and sticks (`lg:self-start lg:sticky lg:top-6`).
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { FairwayTravel } from './FairwayTravel';
import type { TravelItinerary } from './travel-helpers';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('@/app/golf/actions/player-notifications', () => ({
  markTravelSeen: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/app/golf/actions/travel', () => ({
  createGolfTravelItinerary: vi.fn(),
  updateGolfTravelItinerary: vi.fn(),
  deleteGolfTravelItinerary: vi.fn(),
  getExpensesForItinerary: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getExpenseSummary: vi.fn().mockResolvedValue({ success: true, data: null }),
  getBudgetsForItinerary: vi.fn().mockResolvedValue({ success: true, data: [] }),
  exportExpensesToCSV: vi.fn(),
}));

function makeItinerary(id: string, overrides: Partial<TravelItinerary> = {}): TravelItinerary {
  return {
    id,
    event_id: null,
    event_title: null,
    event_name: `Trip ${id}`,
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

describe('FairwayTravel — #173 orphaned detail pane', () => {
  it('never stretches the detail column to the (possibly long) list column height on desktop', () => {
    const itineraries = Array.from({ length: 8 }, (_, i) => makeItinerary(String(i)));

    render(
      <FairwayTravel
        itineraries={itineraries}
        coachId="coach-1"
        teamId="team-1"
        isCoach={false}
        nowISO="2026-07-01"
      />,
    );

    const emptyTitle = screen.getByText('Select a trip');
    // The column wrapper is the `ref`ed `lg:col-span-2` ancestor a few levels
    // up from the empty-state text.
    const detailColumn = emptyTitle.closest('.lg\\:col-span-2');
    expect(detailColumn).not.toBeNull();
    expect(detailColumn).toHaveClass('lg:col-span-2');
    expect(detailColumn).toHaveClass('lg:sticky');
    expect(detailColumn).toHaveClass('lg:top-6');
    expect(detailColumn).toHaveClass('lg:self-start');

    const grid = detailColumn?.parentElement;
    expect(grid).toHaveClass('lg:items-start');
  });

  it('keeps the same sticky/self-start column once a trip IS selected', () => {
    const itineraries = [makeItinerary('a'), makeItinerary('b')];

    render(
      <FairwayTravel
        itineraries={itineraries}
        coachId="coach-1"
        teamId="team-1"
        isCoach={false}
        nowISO="2026-07-01"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Trip a/ }));

    // The detail panel now renders the selected trip's own heading — the LAST
    // "Trip a" match (the first is the still-mounted list-card button label).
    const matches = screen.getAllByText('Trip a');
    const heading = matches[matches.length - 1]!;
    const detailColumn = heading.closest('.lg\\:col-span-2');
    expect(detailColumn).not.toBeNull();
    expect(detailColumn).toHaveClass('lg:sticky');
    expect(detailColumn).toHaveClass('lg:top-6');
    expect(detailColumn).toHaveClass('lg:self-start');
  });
});
